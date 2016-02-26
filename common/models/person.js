var updateDS = require('../../server/middleware/updateDS.js');

module.exports = function(model) {

	model.validatesUniquenessOf('customId', {message: 'a person with this custom Id was already added!'});

	model.beforeRemote('**', function(ctx, unused, next) {
		console.log("person beforeRemote");
		next();
	});

	model.getDataSource = function() {
		return updateDS.getDataSource(this);
	}

};
