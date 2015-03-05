module.exports = function ( glob, opt )
{
	var vfs = require('vinyl-fs'),
		Promise = require('promise');

	return new Promise(function ( resolve, reject )
	{
		vfs.src(glob, {cwd: opt.sourcePath})
			.pipe(vfs.dest(opt.targetPath))
			.on('end', resolve)
			.on('error', reject);
	});
};