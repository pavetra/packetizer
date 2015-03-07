var vfs = require('vinyl-fs'),
	Promise = require('promise');

module.exports = function ( ctx )
{
	return function ( pkg, glob )
	{
		return new Promise(function ( resolve, reject )
		{
			ctx.invokedPromise.then(function ( )
			{
				vfs.src(glob, {cwd: pkg.path})
					.pipe(vfs.dest(ctx.targetPath))
					.on('end', resolve)
					.on('error', reject);
			},
			reject);
		});
	}
};