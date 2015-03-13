module.exports = function ( opt )
{
	var fs = require('fs'),
		vfs = require('vinyl-fs'),
		map = require('map-stream'),
		path = require('path'),
		mkdir = require('mkdirp'),
		lo = require('lodash'),
		Promise = require('promise');

	opt = opt || {};

	var targetFilePath = opt.targetFilePath,
		srcRead = lo.isUndefined(opt.srcRead) ? true : opt.srcRead,
		srcBuffer = lo.isUndefined(opt.srcBuffer) ? true : opt.srcBuffer,
		collectFiles = lo.isUndefined(opt.collectFiles) ? true : opt.collectFiles,
		collectDirectories = lo.isUndefined(opt.collectDirectories) ? false : (targetFilePath ? opt.collectDirectories : false);

	// Default merge function
	// Receives a destination file contents and a list of objects containing a vinyl file object and a aource package metadata hash each
	// Returns a promise which resolves to a new file contents
	// Default merge function is not very useful, it just merges all the source files (order is not guaranteed!) and overwrites the target file contents
	// It also only works well with ASCII files at the moment
	var mergeFunction = lo.isFunction(opt.mergeFunction) ? opt.mergeFunction : function ( contents, files )
	{
		// Ignore current content of the target file
		contents = '';

		lo.forEach(files, function ( data ) { contents += data.file.contents.toString(); } );

		return new Promise.resolve(contents);
	};

	return function ( context )
	{
		var collectPromises = [],
			writePromises = [],
			collectedFiles = {},
			targetFilesContents = {};

		// This promise resolves when source files collection completes
		var collectedPromise = context.invokedPromise.then(function ( ) { return Promise.all(collectPromises); });

		// This promise resolves when all merged files have been written to disk
		var thePromise = collectedPromise.then(function ( ) { return Promise.all(writePromises); });

		// Reads a target file at a specified path
		// Returns a promise resolving to path contents
		var readTargetFile = function ( targetPath )
		{
			return new Promise(function ( resolve )
			{
				fs.readFile(path.resolve(context.targetAbsolutePath, targetPath), function (err, data)
				{
					resolve(err ? false : data.toString());
				});
			});
		};

		// Returns a promise which resolves when collection completes to a value passed as an argument
		var waitUntilCollectionCompletes = function ( targetContents )
		{
			return collectedPromise.then(function ( ) { return Promise.resolve(targetContents); });
		};

		// Calls a mergeFunction
		var mergeFiles = function ( targetPath )
		{
			return function ( targetContents )
			{
				return mergeFunction(targetContents, collectedFiles[targetPath]);
			};
		};

		// Writes file to disk
		// Returns a promise resolving when file has been written
		var writeTargetFile = function ( targetPath )
		{
			var absoluteTargetPath = path.resolve(context.targetAbsolutePath, targetPath),
				absoluteDirectoryPath = path.dirname(absoluteTargetPath);

			return function ( targetContents )
			{
				return new Promise(function ( resolve, reject )
				{
					mkdir(absoluteDirectoryPath, function ( err )
					{
						if (err)
						{
							context.log("Failed creating directories to " + absoluteDirectoryPath, {symbol: '!'})

							reject(err);
						}
						else fs.writeFile(absoluteTargetPath, targetContents, function ( err )
						{
							if (err)
							{
								context.log("Failed saving changes to " + targetPath, {symbol: '!'});

								reject(err);
							}
							else
							{
								resolve();
							}
						});
					});
				});
			};
		};

		// Package hook function
		return function ( context, globs )
		{
			var collectFile = function ( file, cb )
			{
				if ((collectFiles && file.stat.isFile()) || (collectDirectories && file.stat.isDirectory()))
				{
					var targetPath = targetFilePath || path.relative(context.pkg.exportsAbsolutePath, file.path);

					if (lo.isUndefined(collectedFiles[targetPath]))
					{
						collectedFiles[targetPath] = [];

						writePromises.push(readTargetFile(targetPath)
							.then(waitUntilCollectionCompletes)
							.then(mergeFiles(targetPath))
							.then(writeTargetFile(targetPath)));
					}

					collectedFiles[targetPath].push({file: file, pkg: context.pkg});
				}

				cb();
			};

			collectPromises.push(new Promise(function ( resolve, reject )
			{
				vfs.src(globs, {cwd: context.pkg.exportsAbsolutePath, read: srcRead, buffer: srcBuffer})
					.pipe(map(collectFile))
					.on('close', resolve)
					.on('error', reject);
			}));

			return thePromise;
		};
	};
};