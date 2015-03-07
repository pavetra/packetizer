var Promise = require('promise');

// Exports hook function
module.exports = function ( context )
{
	// Returns package hook function
	return function ( pkg, arg )
	{
		// Returns a promise
		return new Promise(function ( resolve, reject )
		{
			// Which resolves immediately
			resolve();
		});
	};
};