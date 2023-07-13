'use strict';
module.exports = (sequelize, DataTypes) => {
  const DeviceTokens = sequelize.define('device_tokens', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    business_id: {
      type: DataTypes.INTEGER,
    },
    user_id: {
      type: DataTypes.INTEGER,
    },
    device_id: {
      type: DataTypes.STRING,
    },
    device_type: {
      type: DataTypes.STRING,
      enum:['ios','android']
    },
    device_token: DataTypes.STRING,
    os_version: {
      type: DataTypes.STRING,
    },
    app_version: {
      type: DataTypes.STRING,
    },
    device_name: {
      type: DataTypes.STRING,
    },
    model_name: {
      type: DataTypes.STRING,
    },
    api_version: {
      type: DataTypes.STRING,
      enum:['production','testing']
    },
    status: {
      type: DataTypes.INTEGER
    },
  }, {
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
   // timestamps: false
 });
  
  DeviceTokens.associate = function(models) {
    // associations can be defined here
    DeviceTokens.belongsTo(models.business, {foreignKey: 'business_id'});
    DeviceTokens.belongsTo(models.user, {foreignKey: 'user_id'});
  };
  return DeviceTokens;
};