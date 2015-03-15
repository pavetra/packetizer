module.exports =
{
	compose: require('./lib/compose.js'),

	hooks: {
		copy: require('./lib/hooks/copy.js'),
		merge: require('./lib/hooks/merge.js'),
		enumerate: require('./lib/hooks/enumerate.js')
	},

	pack: require('./lib/pack.js')
}