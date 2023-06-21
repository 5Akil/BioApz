'use strict';
module.exports = (sequelize, DataTypes) => {
  const WishList = sequelize.define('wishlists', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id : DataTypes.INTEGER,
    product_id : DataTypes.INTEGER,
    price : DataTypes.DOUBLE(11, 2),
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
  }, {
    // timestamps: false
  });
  WishList.associate = function(models) {
    // associations can be defined here
    WishList.belongsTo(models.products, {foreignKey: 'product_id'})
    WishList.belongsTo(models.user, {foreignKey: 'user_id'})
    WishList.belongsTo(models.product_categorys, {foreignKey: 'category_id'})
  };
  return WishList;
};