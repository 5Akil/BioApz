'use strict';
module.exports = (sequelize, DataTypes) => {
  const ProductCategorys = sequelize.define('product_categorys', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    business_id: DataTypes.INTEGER,
    image: DataTypes.STRING,
    name: DataTypes.STRING,
    is_enable :{
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
  ProductCategorys.associate = function(models) {
    // associations can be defined here
    ProductCategorys.hasMany(models.products, {foreignKey: 'category_id'})
    ProductCategorys.belongsTo(models.business, {foreignKey: 'business_id'})
  };
  return ProductCategorys;
};