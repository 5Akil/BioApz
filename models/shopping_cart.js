'use strict';
module.exports = (sequelize, DataTypes) => {
  const ShoppingCart = sequelize.define('shopping_cart', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id : DataTypes.INTEGER,
    product_id : DataTypes.INTEGER,
    qty : DataTypes.DOUBLE(10, 2),
    price : DataTypes.DOUBLE(10, 2),
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
  };
  return ShoppingCart;
};