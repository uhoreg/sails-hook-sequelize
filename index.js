function fixModelDef(modelDef)
{
  _.each(modelDef.attributes, function (attrDef, name) {
    if (_.isString(attrDef.type)) {
      attrDef.type = Sequelize[attrDef.type.toUpperCase()](attrDef.options);
    }
    delete attrDef.options;
  });
  if (modelDef.autoPK) {
    modelDef.attributes.id = {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    };
  }
  if (modelDef.options && _.isObject(modelDef.options.indexes))
  {
    modelDef.options.indexes = _.values(modelDef.options.indexes);
  }
  return modelDef;
}

module.exports = function(sails) {
  global['Sequelize'] = require('sequelize');
  Sequelize.cls = require('continuation-local-storage').createNamespace('sails-sequelize-postgresql');
  return {
    initialize: function(next) {
      var hook = this;
      hook.initAdapters();
      hook.initModels();

      var connection, migrate, sequelize;
      sails.log.verbose('Using connection named ' + sails.config.models.connection);
      connection = sails.config.connections[sails.config.models.connection];
      if (connection == null) {
        throw new Error('Connection \'' + sails.config.models.connection + '\' not found in config/connections');
      }
      if (connection.options == null) {
        connection.options = {};
      }
      connection.options.logging = sails.log.verbose; //A function that gets executed everytime Sequelize would log something.

      migrate = sails.config.models.migrate;
      sails.log.verbose('Migration: ' + migrate);

      sequelize = new Sequelize(connection.database, connection.user, connection.password, connection.options);
      global['sequelize'] = sequelize;

      hook.models = {};
      return sails.modules.loadModels(function(err, models) {
        var modelDef, modelName, ref;
        if (err != null) {
          return next(err);
        }
        for (modelName in models) {
          modelDef = fixModelDef(models[modelName]);
          sails.log.verbose('Loading model \'' + modelDef.globalId + '\'');
          var model = sequelize.define(modelDef.globalId, modelDef.attributes, modelDef.options);
          if (sails.config.globals.models) {
            global[modelDef.globalId] = model;
          }
          sails.models[modelDef.globalId.toLowerCase()] = hook.models[modelDef.globalId] = model;
        }

        for (modelName in models) {
          modelDef = models[modelName];

          hook.setAssociation(modelDef);          
          hook.setDefaultScope(modelDef);          
        }

        if(migrate === 'safe') {
          return next();
        } else {
          var forceSync = migrate === 'drop';
          sequelize.sync({ force: forceSync }).then(function() {
            return next();
          }).catch(function (e) {
            next(e);
          });
        }        
      });
    },

    initAdapters: function() {
      if(sails.adapters === undefined) {
        sails.adapters = {};
      }
    },

    initModels: function() {
      if(sails.models === undefined) {
        sails.models = {};
      }
    },

    setAssociation: function(modelDef) {
      if (modelDef.associations != null) {
        sails.log.verbose('Loading associations for \'' + modelDef.globalId + '\'');
        if (typeof modelDef.associations === 'function') {
          modelDef.associations(modelDef);
        }
        else if (typeof modelDef.associations === 'object') { // catches objects and arrays
            _.each(modelDef.associations, function (association) {
              this.models[modelDef.globalId][association.type](this.models[association.model], association.options);
          }, this);
        }
      }
    },

    setDefaultScope: function(modelDef) {
      if (modelDef.defaultScope != null) {
        sails.log.verbose('Loading default scope for \'' + modelDef.globalId + '\'');
        var model = global[modelDef.globalId];
        if (typeof modelDef.defaultScope === 'function') {
          model.$scope = modelDef.defaultScope() || {};
        }
      }
    }
  };
};
