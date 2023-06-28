'use strict';
module.exports = (sequelize, DataTypes) => {
  const userCoupons = sequelize.define('user_coupons', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    coupon_id: {
        type: DataTypes.INTEGER,
    },
    user_id: {
        type: DataTypes.INTEGER,
    },
    product_id: {
        type: DataTypes.INTEGER,
    },
    order_id: {
        type: DataTypes.INTEGER,
    },
    is_deleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
  }, {
     paranoid: true,
     deletedAt: 'deleted_at',
    // timestamps: false
  });
  
  userCoupons.associate = function(models) {
    // associations can be defined here
    userCoupons.belongsTo(models.user, {foreignKey: 'user_id'})
    userCoupons.belongsTo(models.coupones, {foreignKey: 'coupon_id'})
    userCoupons.belongsTo(models.products, {foreignKey: 'product_id'})
  };
  return userCoupons;
};