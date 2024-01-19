'use strict';
module.exports = (sequelize, DataTypes) => {
  const ShoppingCart = sequelize.define('shopping_cart', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    business_id: {
      type: DataTypes.INTEGER,
    },
    user_id : DataTypes.INTEGER,
    product_id : DataTypes.INTEGER,
    qty : DataTypes.DOUBLE(10, 2),
    price : DataTypes.DOUBLE(10, 2),
    category_id: DataTypes.INTEGER,
    is_loyalty_product:{
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
  }, {
    // timestamps: false
  });
  ShoppingCart.associate = function(models) {
    // associations can be defined here
    ShoppingCart.belongsTo(models.products, {foreignKey: 'product_id'})
    ShoppingCart.belongsTo(models.product_categorys, {foreignKey: 'category_id'})
    ShoppingCart.belongsTo(models.business, {foreignKey: 'business_id'})

  };
  return ShoppingCart;
};