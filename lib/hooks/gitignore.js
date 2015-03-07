var vfs = require('vinyl-fs'),
	map = require('map-stream'),
	path = require('path'),
	Promise = require('promise');

module.exports = function ( context )
{
	var promises = [],
		files = [];

	var collect = function ( file, cb )
	{
				console.log('collect');
		if (file.stat.isFile()) files.push(file.relative);
		console.log('collect');
		cb(null, file);
	};

	// Override default hook promise
	var promise = context.hookPromises['gitignore'] = new Promise(function ( resolve, reject )
	{
		context.invokedPromise.then(function ( )
		{
			Promise.all(promises).then(function ( )
			{
				console.log('runners resolved', promises);

				// Dump everything into gitignore
				console.log(files);

				resolve();
			});
		},
		reject);
	});

	return function ( pkg, glob )
	{
		promises.push(new Promise(function ( resolve, reject )
		{
			glob("**/*.js", options, function (er, files) {
			}


			vfs.src(glob, {cwd: pkg.path, read: false, buffer: false})
				.pipe(map(collect))
				.dest()

				.on('readable', function(){console.log(00)})//resolve)
				.on('data', function(){console.log(11)})//resolve)
				.on('end', function(){console.log(22)})//resolve)
				.on('close', function(){console.log(33)})//resolve)
				.on('error', reject);
		}));

		return promise;
	};
};