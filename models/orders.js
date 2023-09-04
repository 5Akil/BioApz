'use strict';
module.exports = (sequelize, DataTypes) => {
  const Orders = sequelize.define('orders', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id : DataTypes.INTEGER,
    business_id : DataTypes.INTEGER,
    order_no : DataTypes.STRING,
    amount : DataTypes.DOUBLE(11, 2),
    payment_id : DataTypes.STRING,
    payment_status : DataTypes.STRING,
    payment_response : DataTypes.TEXT,
    delivery_status : DataTypes.INTEGER, 
    order_status : DataTypes.INTEGER,
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
  }, {
    // timestamps: false
  });
  Orders.beforeCreate(async (order, options) => {
    function generateCouponCode(length) {
      const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let orderNo = '';
      for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        orderNo += characters.charAt(randomIndex);
      }
      return orderNo;
    }
    order.order_no = generateCouponCode(10);
  });
  Orders.associate = function(models) {
    // associations can be defined here
    Orders.hasMany(models.order_details, {foreignKey: 'order_id'})
    Orders.belongsTo(models.user, {foreignKey: 'user_id'})
    Orders.belongsTo(models.business, {foreignKey: 'business_id'})
    Orders.hasMany(models.reward_history, { foreignKey: 'order_id', as: 'rewards' })
  };
  return Orders;
};