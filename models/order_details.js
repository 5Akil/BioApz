'use strict';
module.exports = (sequelize, DataTypes) => {
  const OrderDetails = sequelize.define('order_details', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id : DataTypes.INTEGER,
    order_id : DataTypes.INTEGER,
    product_id : DataTypes.INTEGER,
    price : DataTypes.DOUBLE,
    qty:DataTypes.INTEGER,
    
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
  }, {
    // timestamps: false
  });
  OrderDetails.associate = function(models) {
    // associations can be defined here
    OrderDetails.belongsTo(models.user, {foreignKey: 'user_id'})
    OrderDetails.belongsTo(models.order, {foreignKey: 'order_id'})
    OrderDetails.belongsTo(models.products, {foreignKey: 'product_id'})
  };
  return OrderDetails;
};