// "use strict";

module.exports = function(model) {

  model.disableRemoteMethodByName('prototype.__get__owner');
  model.disableRemoteMethodByName('prototype.__get__stone');
};
