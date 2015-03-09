var fs = require('fs'),
	vfs = require('vinyl-fs'),
	map = require('map-stream'),
	path = require('path'),
	lo = require('lodash'),
	Promise = require('promise');

module.exports = function ( context )
{
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
				var gitignorePath = path.join(context.targetPath, '.gitignore');

				fs.readFile(gitignorePath, function (err, data)
				{
					var existingFiles = [],
						newFiles = '',
						lineDelimiter = '\n';

					if (err)
					{
						context.log({symbol: '!', hook: 'gitignore', verbose: true}, ".gitignore file doesn't exist or can't be read");
					}
					else
					{
						var dataAsString = data.toString();

						// Determine line delimiter style
						if (dataAsString.indexOf('\r\n') > -1) lineDelimiter = '\r\n';
						else if (dataAsString.indexOf('\n\r') > -1) lineDelimiter = '\n\r';
						else if (dataAsString.indexOf('\r') > -1) lineDelimiter = '\r';

						// Split the file by the chosen delimiter
						// Fragile! Will lead to unwanted result if delimiters are inconsistent
						existingFiles = dataAsString.split(lineDelimiter);

						// Trimming excessive whitespace
						existingFiles = lo.map(existingFiles, function ( string ) { return string.trim(); });

						// Removing irrelevant lines
						lo.remove(existingFiles, function ( string ) { return string == "" || string[0] != '/'; });
					}

					// Select files that are not yet explicitly ignored
					lo.forEach(lo.uniq(files), function ( newFile )
					{
						if (existingFiles.indexOf(newFile) == -1) newFiles += lineDelimiter + newFile;
					});

					if (newFiles)
					{
						fs.appendFile(gitignorePath, newFiles, function ( err )
						{
							if (err)
							{
								context.log({symbol: '!', hook: 'gitignore'}, "Failed to append to .gitignore file at " + gitignorePath);

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
		},
		reject);
	});

	return function ( pkg, arg )
	{
		promises.push(new Promise(function ( resolve, reject )
		{
			vfs.src(arg, {cwd: pkg.path, read: false, buffer: false})
				.pipe(map(collect))
				.on('close', resolve)
				.on('error', reject);
		}));

		return promise;
	};
};