module.exports = function ( ctx, glob )
{
	var vfs = require('vinyl-fs'),
		Promise = require('promise');

	return new Promise(function ( resolve, reject )
	{
		ctx.invokePromise.then(function ( ) {
			vfs.src(glob, {cwd: ctx.sourcePath})
				.pipe(vfs.dest(ctx.targetPath))
				.on('end', resolve)
				.on('error', reject);
		}, reject);
	});
};