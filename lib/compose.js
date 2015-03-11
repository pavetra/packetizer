module.exports = function ( options, callback )
{
	// Requires
	var	fs = require('fs'),
		path = require('path'),
		lo = require('lodash'),
		semver = require('semver'),
		Promise = require('promise'),
		isPromise = require('is-promise');

	// Options
	var // Folder to import packages into
		targetPath = options.targetPath || './',
		// Inject packages from "dependencies" list of package.json
		includeDependencies = 'undefined' == typeof options.includeDependencies ? true : options.includeDependencies,
		// Inject packages from "devDependencies" list of package.json
		includeDevDependencies = 'undefined' == typeof options.includeDevDependencies ? true : options.includeDevDependencies,
		// Only inject specified packages
		onlyThese = options.onlyThese || [],
		// Only inject specified packages and ALL their dependencies
		onlyTheseAndDependent = options.onlyTheseAndDependent || [],
		// Only inject packages with names starting with the specified prefix
		packagePrefix = options.packagePrefix || "",
		// Load dependent packages recursively
		recurseDependencies = 'undefined' == typeof options.recurseDependencies ? true : options.recurseDependencies,
		// Fail if there are two packages with different versions in a dependency tree
		// Otherwise will inject the one with the highest version
		strictVersionCheck = 'undefined' == typeof options.strictVersionCheck ? true : options.strictVersionCheck,
		// Logging function, only called with a single string argument
		logFunction = lo.isFunction(options.logFunction) ? options.logFunction : console.log,
		// To be chatty or not to be?
		verboseLogging = 'undefined' == typeof options.verboseLogging ? false : options.verboseLogging,
		// Custom hook functions
		hooks = options.hooks || {};

	// Global packages list
	var packages = {};

	// Log function
	var log = function ( text, opt )
	{
		if (lo.isUndefined(opt)) opt = false;

		if (verboseLogging || (lo.isBoolean(opt) && !opt) || !opt.verbose)
		{
			var prefix = opt.symbol ? (opt.symbol + ' ') : '  ';

			if (opt.pkg)
			{
				if (opt.pkg.path) prefix += opt.pkg.path.replace(path.join('node_modules', '/'), '');
				if (opt.pkg.version) prefix += '@' + opt.pkg.version;
			}

			if (opt.hook) prefix += '->' + opt.hook;

			logFunction(prefix + (prefix == ' ' ? '' : ' ') + text);
		}

		return text;
	};

	// Recursively traverses through package.json dependency tree, building a plain packages list
	// Returns a promise
	var loadPackages = function ( pkgPath ) { return new Promise(function ( resolveLoad, rejectLoad )
	{
		// Are we at the hierarchy root?
		var root = !pkgPath;
		// If we are, set the path right
		if (root) pkgPath = './';

		try
		{
			var packageJson = JSON.parse(fs.readFileSync(path.join(pkgPath, 'package.json')));

			var wouldRegister = false, wouldRecurse = false;

			if (root)
			{
				wouldRecurse = true;
			}
			else if (packageJson.packetizer)
			{
				if (packages[packageJson.name])
				{
					if (!semver.eq(packageJson.version, packages[packageJson.name].version))
					{
						if (strictVersionCheck)
						{
							log('', {symbol: semver.gt(packageJson.version, packages[packageJson.name].version) ? '>' : '<', pkg: {path: pkgPath, version: packageJson.version}});
							log('', {symbol: semver.gt(packageJson.version, packages[packageJson.name].version) ? '<' : '>', pkg: {path: packages[packageJson.name].path, version: packages[packageJson.name].version}});

							rejectLoad(log("Mismatching versions, exiting now, set strictVersionCheck to 'false' to override", {symbol: '!'}));
						}
						else if (semver.gt(packageJson.version, packages[packageJson.name].version))
						{
							log("skipped, newer version exists", {symbol: '-', pkg: {path: packages[packageJson.name].path, version: packages[packageJson.name].version}, verbose: true});

							wouldRegister = true;
						}
						else
						{
							log("skipped, newer version exists", {symbol: '-', pkg: {path: pkgPath, version: packageJson.version}, verbose: true});
						}
					}
					else
					{
						log("skipped, duplicate", {symbol: '-', pkg: {path: pkgPath, version: packageJson.version}, verbose: true});
					}
				}
				else
				{
					wouldRegister = true;
				}

				wouldRecurse = wouldRegister && recurseDependencies;
			}
			else
			{
				log("skipped, not a packetizer package", {symbol: '-', pkg: {path: pkgPath, version: packageJson.version}, verbose: true});
			}

			if (wouldRegister)
			{
				packages[packageJson.name] = {
					name: packageJson.name,
					path: pkgPath,
					absolutePath: path.join(process.cwd(), pkgPath),
					version: packageJson.version,
					exportsPath: packageJson.packetizer.exportsPath || '',
					exportsAbsolutePath: path.join(process.cwd(), pkgPath, packageJson.packetizer.exportsPath || ''),
					hooks: packageJson.packetizer.hooks || {}
				}
			}

			if (wouldRecurse)
			{
				// Get the list of dependencies
				var dependencies = lo.union
				(
					(!root || includeDependencies) && lo.isPlainObject(packageJson.dependencies) ? lo.keys(packageJson.dependencies) : [],
					root && includeDevDependencies && lo.isPlainObject(packageJson.devDependencies) ? lo.keys(packageJson.devDependencies) : []
				);

				// Filters
				if (!lo.isEmpty(onlyTheseAndDependent) && root) dependencies = lo.intersection(dependencies, onlyTheseAndDependent);
				if (!lo.isEmpty(onlyThese)) dependencies = lo.intersection(dependencies, onlyThese);
				if (!lo.isEmpty(packagePrefix)) lo.remove(packages, function ( value ) { return !lo.startsWith(value, packagePrefix); } );

				var promises = [];

				// Recurse
				lo.forEach(dependencies, function ( pkgName )
				{
					promises.push(loadPackages(path.join(pkgPath, 'node_modules', pkgName)));
				});

				Promise.all(promises).then(resolveLoad, rejectLoad);
			}
			else
			{
				resolveLoad();
			}
		}
		catch (e)
		{
			rejectLoad(log("Failed reading package.json", {symbol: '!', pkg: {path: pkgPath}}));
		}
	})};

	// Invokes all the hooks
	var invokeHooks = function ( )
	{
		var resolveInvoke,
			rejectInvoke,
			invokedPromise = new Promise(function ( resolve, reject ) { resolveInvoke = resolve; rejectInvoke = reject; }),
			pkgHookFunctions = {},
			pkgPromiseArrays = {},
			hookPromiseArrays = {};

		// Global context
		var context = {
			targetPath: targetPath,
			targetAbsolutePath: path.join(process.cwd(), targetPath),
			invokedPromise: invokedPromise,
			pkgPromises: {},
			hookPromises: {}
		};

		lo.forEach(packages, function ( pkg )
		{
			log("being invoked", {symbol: '+', pkg: pkg});

			// Package promise
			// Resolves when all package hooks in this package resolve
			// Rejects, when one of them rejects
			context.pkgPromises[pkg.name] = new Promise(function ( resolve, reject )
			{
				// Make it durable
				var pkgName = pkg.name;

				// This is a tricky bit...
				// We can't just then an .all promise because pkgPromises[pkgName] is empty at the moment,
				// which means that our promise would resolve immediately.
				// So instead we use then of the invokedPromise to trigger .all promise creation.
				invokedPromise.then(function ( ) { Promise.all(pkgPromiseArrays[pkgName]).then(resolve, reject); }, reject);
			});

			lo.forEach(pkg.hooks, function ( arg, hook )
			{
				log("being invoked", {pkg: pkg, hook: hook, verbose: true});

				// Lazy require built-in hooks
				if ('undefined' == typeof hooks[hook]) try
				{
					// This will fail badly if you require an undefined non-built-in hook!
					hooks[hook] = require('./hooks/' + hook)();
				}
				catch ( e )
				{
					rejectInvoke(log("error requiring hook", {symbol: '!', pkg: pkg, hook: hook}));

					throw e;
				}

				// Have we invoked the hook before?
				if ('undefined' == typeof context.hookPromises[hook])
				{
					// Default hook promise
					// Resolves when all package hooks of this type resolve
					// Rejects, when one of them rejects
					context.hookPromises[hook] = new Promise(function ( resolve, reject )
					{
						// Look above for comments
						var hookName = hook;
						invokedPromise.then(function ( ) { Promise.all(hookPromiseArrays[hookName]).then(resolve, reject); }, reject);
					});

					// Shallow clone global context
					var hookContext = lo.clone(context);
					// ... and add a hook-flavoured log function
					hookContext.log = function ( text, opt )
					{
						var _opt = {hook: hook};
						if (lo.isBoolean(opt)) _opt.verbose = opt;
						else if (lo.isPlainObject(opt)) lo.assign(_opt, opt);
						return log(text, _opt);
					};

					// Call the hook function
					// It MUST return a package hook function
					pkgHookFunctions[hook] = hooks[hook](hookContext);
				}

				// Shallow clone global context
				var pkgHookContext = lo.clone(context);
				// ... add a package reference
				pkgHookContext.pkg = pkg;
				// ... and a package-and-hook-flavoured log function
				pkgHookContext.log = function ( text, opt )
				{
					var _opt = {hook: hook, pkg: pkg};
					if (lo.isBoolean(opt)) _opt.verbose = opt;
					else if (lo.isPlainObject(opt)) lo.assign(_opt, opt);
					return log(text, _opt);
				};

				// Call the package hook function
				// It MUST return a promise
				var promise = pkgHookFunctions[hook](pkgHookContext, arg);

				// Push the promise into according arrays
				if (!pkgPromiseArrays[pkg.name]) pkgPromiseArrays[pkg.name] = [];
				pkgPromiseArrays[pkg.name].push(promise);
				if (!hookPromiseArrays[hook]) hookPromiseArrays[hook] = [];
				hookPromiseArrays[hook].push(promise);
			});
		});

		resolveInvoke();

		return Promise.all(lo.toArray(context.hookPromises));
	}

	// And now ignite the whole thing
	return loadPackages()
		.then(invokeHooks)
		.nodeify(callback);
};