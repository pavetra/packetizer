module.exports = function ( opt )
{
	var lo = require('lodash');
		path = require('path');

	opt = opt || {};

	// Disable file reads - we only need paths!
	opt.srcRead = false;
	opt.srcBuffer = false;

	// When true, merge function doesn't look for tags, but overwrites the whole file
	opt.overwrite = lo.isUndefined(opt.overwrite) ? false : opt.overwrite;
	// Tags to insert merged contents inbetween
	opt.openTag = opt.openTag || "/* Packetizer Enumerate START */";
	opt.closeTag = opt.closeTag || "/* Packetizer Enumerate END */";
	// When true, will append to the target file if correct tags were not found, otherwise will throw an error
	opt.appendWhenNoTags = lo.isUndefined(opt.appendWhenNoTags) ? true : opt.appendWhenNoTags;

	// The below will only be used if default filenameFunction used
	opt.filenameTemplate = opt.filenameTemplate || '{{filename}}';
	opt.filePathOffset = opt.filePathOffset || './';
	opt.fixWindowsSlashes = lo.isUndefined(opt.fixWindowsSlashes) ? true : opt.fixWindowsSlashes;
	opt.appendLineBreak = lo.isUndefined(opt.appendLineBreak) ? true : opt.appendLineBreak;

	var filenameFunction = lo.isFunction(opt.filenameFunction) ? opt.filenameFunction : function ( file, pkg, sequence, isLast, lineBreak )
	{
		var filename = path.relative(path.resolve(pkg.exportsAbsolutePath, opt.filePathOffset), file.path);

		if (opt.fixWindowsSlashes) filename = filename.replace(/\\/g, "/").replace(/^[a-zA-Z]:/, "");

		if (opt.appendLineBreak) filename += lineBreak;

		return opt.filenameTemplate.replace(/{{filename}}/gm, filename);
	};

	opt.mergeFunction = function ( contents, files )
	{
		contents = contents || '';

		var lineBreak = '\n';

		if (contents.indexOf('\r\n') > -1) lineBreak = '\r\n';
		else if (contents.indexOf('\n\r') > -1) lineBreak = '\n\r';
		else if (contents.indexOf('\r') > -1) lineBreak = '\r';

		var mergedFilenames = '';

		for (var i = 0; i < files.length; ++i) mergedFilenames += filenameFunction(files[i].file, files[i].pkg, i, (i + 1) == files.length, lineBreak);

		var posOpen, posClose,
			contentsBefore, contentsAfter;

		if (opt.overwrite)
		{
			contentsBefore = '';
			contentsAfter = '';
		}
		else if ((posOpen = contents.indexOf(opt.openTag)) > -1 && (posClose = contents.indexOf(opt.closeTag)) > -1)
		{
			contentsBefore = contents.substr(0, posOpen + opt.openTag.length);
			contentsAfter = contents.substr(posClose);
		}
		else if (opt.appendWhenNoTags)
		{
			contentsBefore = contents + opt.openTag;
			contentsAfter = opt.closeTag;
		}
		else throw new Error('Tags not found');

		if (opt.appendLineBreak) contentsBefore += lineBreak;

		return Promise.resolve(contentsBefore + mergedFilenames + contentsAfter);
	};

	return require('./merge')(opt);
};