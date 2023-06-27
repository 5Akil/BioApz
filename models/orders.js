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
  Orders.associate = function(models) {
    // associations can be defined here
    Orders.hasMany(models.order_details, {foreignKey: 'order_id'})
    Orders.belongsTo(models.user, {foreignKey: 'user_id'})
    Orders.belongsTo(models.business, {foreignKey: 'business_id'})
    
  };
  return Orders;
};