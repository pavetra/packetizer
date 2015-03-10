module.exports = function ( opt )
{
	opt = opt || {};

	var fs = require('fs'),
		vfs = require('vinyl-fs'),
		map = require('map-stream'),
		path = require('path'),
		lo = require('lodash'),
		Promise = require('promise');

	return function ( context )
	{
		// Globals
		var promises = [],
			files = [];

		var collect = function ( file, cb )
		{
			if (file.stat.isFile()) files.push("/" + file.relative.replace(/\\/g, "/"));

			cb(null);
		};

		// Override default hook promise
		var promise = context.hookPromises['gitignore'] = new Promise(function ( resolve, reject )
		{
			context.invokedPromise.then(function ( )
			{
				Promise.all(promises).then(function ( )
				{
					var gitignorePath = opt.gitignorePath || path.join(context.targetPath, '.gitignore');

					fs.readFile(gitignorePath, function (err, data)
					{
						var existingIgnores = [],
							newIgnores = '',
							lineBreak = opt.lineBreak || '\n';

						if (!err)
						{
							var dataAsString = data.toString();

							if (!opt.lineBreak)
							{
								if (dataAsString.indexOf('\r\n') > -1) lineBreak = '\r\n';
								else if (dataAsString.indexOf('\n\r') > -1) lineBreak = '\n\r';
								else if (dataAsString.indexOf('\r') > -1) lineBreak = '\r';
							}

							// Split the file
							existingIgnores = dataAsString.split(lineBreak == '\r' ? '\r' : '\n');

							// Trimming excessive whitespace
							existingIgnores = lo.map(existingIgnores, function ( string ) { return string.trim(); });

							// Removing irrelevant lines
							lo.remove(existingIgnores, function ( string ) { return string == "" || string[0] != '/'; });
						}

						// Select files that are not yet explicitly ignored
						lo.forEach(lo.uniq(files), function ( newIgnore )
						{
							if (existingIgnores.indexOf(newIgnore) == -1) newIgnores += lineBreak + newIgnore;
						});

						if (newIgnores)
						{
							fs.appendFile(gitignorePath, newIgnores, function ( err )
							{
								if (err)
								{
									context.log("Failed to append to .gitignore file at " + gitignorePath, {symbol: '!', hook: 'gitignore'});

									reject();
								}
								else
								{
									resolve();
								}
							});
						}
						else
						{
							resolve();
						}
					});
				});
			});
		});

		return function ( pkg, globs )
		{
			promises.push(new Promise(function ( resolve, reject )
			{
				vfs.src(globs, {cwd: pkg.path, read: false, buffer: false})
					.pipe(map(collect))
					.on('close', resolve)
					.on('error', reject);
			}));

			return promise;
		};
	};
};