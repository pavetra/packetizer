module.exports =
{
	compose: require('./lib/compose.js'),

	hooks: {
		copy: require('./lib/hooks/copy.js'),
		gitignore: require('./lib/hooks/gitignore.js')
	},

	pack: require('./lib/pack.js')
}