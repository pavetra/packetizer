module.exports = function ( opt )
{
	opt = opt || {};

	var vfs = require('vinyl-fs'),
		Promise = require('promise');

	// Hook function
	return function ( context )
	{
		var targetPath = opt.targetPath || context.targetPath;

		// Package hook function
		return function ( pkg, globs )
		{
			// Promise
			return new Promise(function ( resolve, reject )
			{
				context.invokedPromise.then(function ( )
				{
					vfs.src(globs, {cwd: pkg.path})
						.pipe(vfs.dest(targetPath))
						.on('end', resolve)
						.on('error', reject);
				},
				reject);
			});
		}
	};
}