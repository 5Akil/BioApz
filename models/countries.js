'use strict';
module.exports = (sequelize, DataTypes) => {
  const Countries = sequelize.define('countries', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    country_code: DataTypes.STRING,
    name: DataTypes.STRING,
    phone_code: {
      type: DataTypes.STRING,
    },
    currency: {
      type: DataTypes.STRING,
    },
    currency_symbol: {
      type: DataTypes.STRING,
    },
    expiration_days: {
      type: DataTypes.INTEGER,
    },
    status: {
      type: DataTypes.BOOLEAN
    },
  }, {
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
   // timestamps: false
 });
  
  Countries.associate = function(models) {
    // associations can be defined here
    Countries.hasMany(models.business, {foreignKey: 'country_id'});
    Countries.hasMany(models.user, {foreignKey: 'country_id'});
  };
  return Countries;
};