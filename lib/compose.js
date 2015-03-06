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
	var log = function ( text, verbose )
	{
		if (!verbose || verboseLogging) logFunction(text);

		return text;
	};

	// Helper function creating beautiful package names for logs
	var logPkg = function ( pkgPath, version )
	{
		return pkgPath.replace(path.join('node_modules', '/'), '') + "@" + version;
	}

	// [Recursively] traverses through package.json dependency tree, building a plain package list
	function loadPackages ( pkgPath )
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
			else try
			{
				var exportsJson = JSON.parse(fs.readFileSync(path.join(pkgPath, 'exports.json')));

				if (packages[packageJson.name])
				{
					if (!semver.eq(packageJson.version, packages[packageJson.name].version))
					{
						if (strictVersionCheck)
						{
							log("- " + logPkg(pkgPath, packageJson.version) + (semver.gt(packageJson.version, packages[packageJson.name].version) ? " > " : " < ") + packages[packageJson.name].path + "@" + packages[packageJson.name].version);
							log("- mismatching versions, exiting now, set strictVersionCheck to false to override");
							// TODO: Halt
						}
						else if (semver.gt(packageJson.version, packages[packageJson.name].version))
						{
							log("- " + logPkg(packages[packageJson.name].path, packages[packageJson.name].version) + " skipped, newer version exists", true);

							wouldRegister = true;
						}
						else
						{
							log("- " + logPkg(pkgPath, packageJson.version) + " skipped, newer version exists", true);
						}
					}
					else
					{
						log("- " + logPkg(pkgPath, packageJson.version) + " skipped, duplicate", true);
					}
				}
				else
				{
					wouldRegister = true;
				}

				wouldRecurse = wouldRegister && recurseDependencies;
			}
			catch ( e )
			{
				log("- " + logPkg(pkgPath, packageJson.version) + " skipped, missing exports.json", true);
			}

			if (wouldRegister)
			{
				packages[packageJson.name] = {
					name: packageJson.name,
					path: pkgPath,
					version: packageJson.version,
					exports: exportsJson
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

				// Recurse
				lo.forEach(dependencies, function ( pkgName )
				{
					loadPackages(path.join(pkgPath, 'node_modules', pkgName));
				});
			}
		}
		catch (e)
		{
			log("Failed reading package.json from " + pkgPath);
		}
	};

	// Do the voodoo
	loadPackages();

	// Promises and resolvers mumbo jumbo
	var initResolver,
		initRejector,
		initPromise: new Promise( function ( resolve ) { initResolver = resolve; initRejector = reject; } ),
		pkgPromises = {},
		hookPromises = {};
		promises = [];

	// Context object for hooks
	var ctx = {
		targetPath: targetPath,
		initPromise: initPromise,
		pkgPromises: {},
		hookPromises: {},
		log: log
	};

	lo.forEach(packages, function ( pkg )
	{
		log("+ " + logPkg(pkg.path, pkg.version) + " being injected");

		ctx.pkgPromises[pkg.name] = new Promise(function ( resolve, reject )
		{
			// Make it durable
			var pkgName = pkg.name;

			// This is a tricky bit...
			// We can't just invoke an .all promise because pkgPromises[pkgName] is empty at the moment,
			// which means that our promise would resolve immediately.
			// So instead we use then of the initPromise to trigger .all promise creation.
			initPromise.then(function ( ) { Promise.all(pkgPromises[pkgName]).then(resolve, reject); });
		});

		lo.forEach(pkg.exports, function ( params, hook )
		{
			log("+ " + logPkg(pkg.path, pkg.version) + "." + hook + " being invoked", true);

			if ('undefined' == typeof ctx.hookPromises[hook])
			{
				ctx.hookPromises[hook] = new Promise(function ( resolve, reject )
				{
					// Look above for comments
					var hookName = hook;
					initPromise.then(function ( ) { Promise.all(hookPromises[hookName]).then(resolve, reject); });
				});
			}

			// Lazy require standard hooks
			if ('undefined' == typeof hooks[hook]) try
			{
				// This will fail badly if you request an undefined non-standard hook!
				hooks[hook] = require('./hooks/' + hook);
			}
			catch ( e )
			{
				log("! " + logPkg(pkg.path, pkg.version) + "." + hook + " undefined non-standard hook");

				initRejector();
			}

			// Invoke a hook function
			// It MUST return promise
			var promise = hooks[hook](ctx, pkg, params);

			// Push the promise to according arrays
			pkgPromises[pkg.name].push(promise);
			hookPromises[hook].push(promise);
			promises.push(promise);
		});
	});

	initResolver();

	return Promise.all(promises).nodeify(callback);
};