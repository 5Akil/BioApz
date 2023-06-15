'use strict';
module.exports = (sequelize, DataTypes) => {
  const BusinessCategorys = sequelize.define('business_categorys', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: DataTypes.STRING,
    status: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }, 
    is_deleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
  }, {
    // timestamps: false
  });
  BusinessCategorys.associate = function(models) {
    // associations can be defined here
    BusinessCategorys.hasMany(models.business, {foreignKey: 'category_id'})
    BusinessCategorys.hasMany(models.templates, {foreignKey: 'category_id'})
  };
  return BusinessCategorys;
};