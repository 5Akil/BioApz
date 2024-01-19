// 'use strict';
// module.exports = (sequelize,DataTypes) => {
//   const OrderDetails = sequelize.define('order_details',{
//     id: {
//       type: DataTypes.INTEGER,
//       primaryKey: true,
//       autoIncrement: true,
//     },
//     user_id: DataTypes.INTEGER,
//     order_id: DataTypes.INTEGER,
//     business_id: DataTypes.INTEGER,
//     product_id: DataTypes.INTEGER,
//     price: DataTypes.DOUBLE,
//     qty: DataTypes.INTEGER,
//     order_status: DataTypes.INTEGER,
//     category_id: DataTypes.INTEGER,
//     discount_type: {
//       type: DataTypes.BOOLEAN
//     },
//     discount_price: DataTypes.DECIMAL,
//     is_loyalty_product:{
//       type: DataTypes.BOOLEAN,
//       defaultValue: false
//     },
//     is_deleted: {
//       type: DataTypes.BOOLEAN,
//       defaultValue: false
//     },
//   },{
//     // timestamps: false
//   });
//   OrderDetails.associate = function(models) {
//     // associations can be defined here
//     OrderDetails.belongsTo(models.user,{foreignKey: 'user_id'})
//     OrderDetails.belongsTo(models.orders,{foreignKey: 'order_id'})
//     OrderDetails.belongsTo(models.products,{foreignKey: 'product_id'})
//   };
//   return OrderDetails;
// };


'use strict';
module.exports = (sequelize,DataTypes) => {
  const OrderDetails = sequelize.define('order_details',{
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id: DataTypes.INTEGER,
    order_id: DataTypes.INTEGER,
    discount_id: DataTypes.INTEGER,
    business_id: DataTypes.INTEGER,
    product_id: DataTypes.INTEGER,
    price: DataTypes.DOUBLE,
    qty: DataTypes.INTEGER,
    order_status: DataTypes.INTEGER,
    order_status_label: DataTypes.STRING,
    category_id: DataTypes.INTEGER,
    final_price: DataTypes.DOUBLE,
    coupon_id: DataTypes.INTEGER,
    coupon_type: DataTypes.BOOLEAN,
    coupon_price: DataTypes.DOUBLE,
    loyality_point_id: DataTypes.INTEGER,
    loyalty_type: DataTypes.BOOLEAN,
    loyalty_price: DataTypes.DOUBLE,
    cashback_id: DataTypes.INTEGER,
    cashback_type: DataTypes.BOOLEAN,
    cashback_value: DataTypes.INTEGER,
    virtual_card_id: DataTypes.INTEGER,
    virtual_card_value: DataTypes.DOUBLE,
    is_loyalty_product: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    is_free: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    discount_type: {
      type: DataTypes.BOOLEAN
    },
    discount_price: DataTypes.DECIMAL,
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
  },{
    // timestamps: false
  });
  OrderDetails.associate = function(models) {
    // associations can be defined here
    OrderDetails.belongsTo(models.user,{foreignKey: 'user_id'})
    OrderDetails.belongsTo(models.orders,{foreignKey: 'order_id'})
    OrderDetails.belongsTo(models.products,{foreignKey: 'product_id'})
  };
  return OrderDetails;
};