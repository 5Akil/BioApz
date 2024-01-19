// 'use strict';
// module.exports = (sequelize, DataTypes) => {
//   const Orders = sequelize.define('orders', {
//     id: {
//       type: DataTypes.INTEGER,
//       primaryKey: true,
//       autoIncrement: true,
//     },
//     user_id : DataTypes.INTEGER,
//     business_id : DataTypes.INTEGER,
//     order_no : DataTypes.STRING,
//     amount : DataTypes.DOUBLE(11, 2),
//     payment_id : DataTypes.STRING,
//     payment_status : DataTypes.STRING,
//     payment_response : DataTypes.TEXT,
//     delivery_status : DataTypes.INTEGER, 
//     order_status : DataTypes.INTEGER,
//     invoice_no: DataTypes.STRING ,
//     invoice_path:DataTypes.STRING,
//     is_pickup: DataTypes.BOOLEAN,
//     pickup_time:DataTypes.STRING,
//     is_deleted: {
//       type: DataTypes.BOOLEAN,
//       defaultValue: false
//     },
//   }, {
//     // timestamps: false
//   });
//   Orders.beforeCreate(async (order, options) => {
//     function generateCouponCode(length) {
//       const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
//       let orderNo = '';
//       for (let i = 0; i < length; i++) {
//         const randomIndex = Math.floor(Math.random() * characters.length);
//         orderNo += characters.charAt(randomIndex);
//       }
//       return orderNo;
//     }
//     order.order_no = generateCouponCode(10);
//   });
//   Orders.associate = function(models) {
//     // associations can be defined here
//     Orders.hasMany(models.order_details, {foreignKey: 'order_id'})
//     Orders.belongsTo(models.user, {foreignKey: 'user_id'})
//     Orders.belongsTo(models.business, {foreignKey: 'business_id'})
//     Orders.hasMany(models.reward_history, { foreignKey: 'order_id', as: 'rewards' })
//   };
//   return Orders;
// };


// // 'use strict';
// // module.exports = (sequelize,DataTypes) => {
// //   const Orders = sequelize.define('orders',{
// //     id: {
// //       type: DataTypes.INTEGER,
// //       primaryKey: true,
// //       autoIncrement: true,
// //     },
// //     user_id: DataTypes.INTEGER,
// //     business_id: DataTypes.INTEGER,
// //     order_no: DataTypes.STRING,
// //     amount: DataTypes.DOUBLE,
// //     total_discounts: DataTypes.DOUBLE,
// //     payment_id: DataTypes.STRING,
// //     payment_status: DataTypes.STRING,
// //     coupon_id: DataTypes.INTEGER,
// //     coupon_type: DataTypes.BOOLEAN,
// //     coupon_value: DataTypes.DOUBLE,
// //     coupon_code: DataTypes.TEXT,
// //     virtual_card_id: DataTypes.INTEGER,
// //     virtual_card_value: DataTypes.DOUBLE,
// //     cashback: DataTypes.DOUBLE,
// //     payment_response: DataTypes.TEXT,
// //     delivery_status: DataTypes.INTEGER,
// //     order_status: DataTypes.INTEGER,
// //     is_deleted: {
// //       type: DataTypes.BOOLEAN,
// //       defaultValue: false
// //     },
// //   },{
// //     // timestamps: false
// //   });
// //   Orders.beforeCreate(async (order,options) => {
// //     function generateCouponCode(length) {
// //       const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
// //       let orderNo = '';
// //       for(let i = 0;i < length;i++) {
// //         const randomIndex = Math.floor(Math.random() * characters.length);
// //         orderNo += characters.charAt(randomIndex);
// //       }
// //       return orderNo;
// //     }
// //     order.order_no = generateCouponCode(10);
// //   });
// //   Orders.associate = function(models) {
// //     // associations can be defined here
// //     Orders.hasMany(models.order_details,{foreignKey: 'order_id'})
// //     Orders.belongsTo(models.user,{foreignKey: 'user_id'})
// //     Orders.belongsTo(models.business,{foreignKey: 'business_id'})
// //     Orders.hasMany(models.reward_history,{foreignKey: 'order_id',as: 'rewards'})
// //   };
// //   return Orders;
// // };






'use strict';
module.exports = (sequelize,DataTypes) => {
  const Orders = sequelize.define('orders',{
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id: DataTypes.INTEGER,
    business_id: DataTypes.INTEGER,
    order_no: DataTypes.STRING,
    is_pickup: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    amount: DataTypes.DOUBLE,
    total_discounts: DataTypes.DOUBLE,
    payment_id: DataTypes.STRING,
    payment_status: DataTypes.STRING,
    invoice_no: DataTypes.STRING,
    pickup_time: DataTypes.STRING,
    invoice_path: DataTypes.STRING,
    coupon_id: DataTypes.INTEGER,
    coupon_type: DataTypes.BOOLEAN,
    coupon_value: DataTypes.DOUBLE,
    coupon_code: DataTypes.TEXT,
    virtual_card_id: DataTypes.INTEGER,
    virtual_card_value: DataTypes.DOUBLE,
    cashback: DataTypes.DOUBLE,
    payment_response: DataTypes.TEXT,
    delivery_status: DataTypes.INTEGER,
    order_status: DataTypes.INTEGER,
    order_status_label: DataTypes.STRING,
    business_revenue: DataTypes.DOUBLE,
    giftcard_used_amount: DataTypes.DOUBLE,
    coupon_discount_amount: DataTypes.DOUBLE,
    admin_revenue: DataTypes.DOUBLE,
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
  },{
    // timestamps: false
  });
  Orders.beforeCreate(async (order,options) => {
    function generateCouponCode(length) {
      const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let orderNo = '';
      for(let i = 0;i < length;i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        orderNo += characters.charAt(randomIndex);
      }
      return orderNo;
    }
    order.order_no = generateCouponCode(10);
  });
  Orders.associate = function(models) {
    // associations can be defined here
    Orders.hasMany(models.order_details,{foreignKey: 'order_id'})
    Orders.belongsTo(models.user,{foreignKey: 'user_id'})
    Orders.belongsTo(models.business,{foreignKey: 'business_id'})
    Orders.hasMany(models.reward_history,{foreignKey: 'order_id',as: 'rewards'})
  };
  return Orders;
};