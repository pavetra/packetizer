module.exports = function ( options )
{
	// Requires
	var	fs = require('fs'),
		path = require('path'),
		lo = require('lodash'),
		Promise = require('promise'),
		isPromise = require('is-promise');

	// Options
	var // Folder to import packages into
		targetPath = options.targetPath || './',
		// Array of package names to include
		packages = options.packages || [],
		// If the above is empty, packages will be loaded from the file specified
		packageJsonPath = options.packageJsonPath || "./package.json",
		// When loading package.json, include packages from "dependencies" list
		includeDependencies = 'undefined' == typeof options.includeDependencies ? true : options.includeDependencies,
		// When loading package.json, include packages from "devDependencies" list
		includeDevDependencies = 'undefined' == typeof options.includeDevDependencies ? true : options.includeDevDependencies,
		// Only include packages with names starting with the specified prefix
		packagePrefix = options.packagePrefix || "",
		// Logging function, only called with a single string argument
		logFunction = lo.isFunction(options.logFunction) ? options.logFunction : console.log,
		// To be chatty or not to be?
		verboseLogging = 'undefined' == typeof options.verboseLogging ? false : options.verboseLogging,
		// Hooks object
		hooks = options.hooks || {},
		// Callback funciton for those who don't trust promises
		callback = lo.isFunction(options.callback) ? options.callback : false;

	// Log function
	var log = function ( text, verbose )
	{
		if (!verbose || verboseLogging) logFunction(text);
	};

	// Shall we compose specified packages or get the list from package.json dependencies?
	if (!lo.isArray(packages) || lo.isEmpty(packages))
	{
		var packageJson = JSON.parse(fs.readFileSync(packageJsonPath));

		packages = lo.union
		(
			includeDependencies && lo.isPlainObject(packageJson.dependencies) ? lo.keys(packageJson.dependencies) : [],
			includeDevDependencies && lo.isPlainObject(packageJson.devDependencies) ? lo.keys(packageJson.devDependencies) : []
		);
	}

	// Filter packages by prefix
	if (!lo.isEmpty(packagePrefix))
	{
		lo.remove(packages, function ( value ) { return !lo.startsWith(value, packagePrefix); } );
	}

	var promises = [];

	// Compose all packages, collecting promises from hook functions
	lo.forEach(packages, function ( pkg )
	{
		promises.push(new Promise(function ( resolve, reject )
		{
			fs.readFile(path.join('./node_modules', pkg, 'exports.json'), function ( err, data )
			{
				if (err)
				{
					log('- ' + pkg + ' no exports.json found, skipping package');

					resolve();
				}
				else
				{
					log('+ ' + pkg);

					var opts = {
						sourcePath: path.join('./node_modules', pkg),
						targetPath: targetPath,
						packageName: pkg,
						log: log
					};

					var pkgPromises = [];

					lo.forEach(JSON.parse(data), function ( param, hook )
					{
						log('  ' + pkg + '.' + hook, true);

						// Lazy require for standard hooks
						if (!lo.isFunction(hooks[hook])) hooks[hook] = require('./hooks/' + hook);

						// Call hook
						var promise = hooks[hook](param, opts);

						// Throw an exception if your custom hook doesn't return promise
						if (!isPromise(promise)) throw new TypeError('Hook must return promise: ' + hook);

						pkgPromises.push(promise);
					});

					Promise.all(pkgPromises).then(resolve, reject);
				}
			});
		}));
	});

	// One promise to rule them all
	var myPrecious = Promise.all(promises);

	// Pleasing promise haters
	if (callback)
	{
		myPrecious.then(function ( )
		{
			callback(null);
		},
		function ( )
		{
			callback('Packetizer.compose() exploded');
		});
	}

	return myPrecious;
};