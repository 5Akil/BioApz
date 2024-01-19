// 'use strict';
// module.exports = (sequelize, DataTypes) => {
//   const RewardHistory = sequelize.define('reward_history', {
//     id: {
//       type: DataTypes.INTEGER,
//       primaryKey: true,
//       autoIncrement: true,
//     },
//     product_id: {
//         type: DataTypes.INTEGER,
//     },
//     order_id: {
//         type: DataTypes.INTEGER,
//     },
//     amount: {
//       type: DataTypes.DOUBLE(11, 2),
//     },
//     credit_debit: {
//         type: DataTypes.BOOLEAN,
//         default: true
//     },
//     reference_reward_id: {
//         type: DataTypes.INTEGER,
//     },
//     reference_reward_type: {
//         type: DataTypes.TEXT,
//     },
//   }, {
//      paranoid: true,
//      deletedAt: 'deleted_at',
//     // timestamps: false
//   });


//   RewardHistory.associate = function(models) {
//     // associations can be defined here
//     RewardHistory.belongsTo(models.orders, {foreignKey: 'order_id'});
//   };
  
//   return RewardHistory;
// };

'use strict';
module.exports = (sequelize,DataTypes) => {
  const RewardHistory = sequelize.define('reward_history',{
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    giftcard_id: {
      type: DataTypes.INTEGER,
    },
    user_gift_card_id: {
      type: DataTypes.INTEGER,
    },
    product_id: {
      type: DataTypes.INTEGER,
    },
    order_id: {
      type: DataTypes.INTEGER,
    },
    amount: {
      type: DataTypes.DOUBLE(11,2),
    },
    credit_debit: {
      type: DataTypes.BOOLEAN,
      default: true
    },
    reference_reward_id: {
      type: DataTypes.INTEGER,
    },
    reference_reward_type: {
      type: DataTypes.TEXT,
    },
  },{
    paranoid: true,
    deletedAt: 'deleted_at',
    // timestamps: false
  });


  RewardHistory.associate = function(models) {
    // associations can be defined here
    RewardHistory.belongsTo(models.user,{foreignKey: 'user_id'});
    RewardHistory.belongsTo(models.orders,{foreignKey: 'order_id'});
    RewardHistory.belongsTo(models.gift_cards,{foreignKey: 'giftcard_id'})
    RewardHistory.belongsTo(models.user_giftcards,{foreignKey: 'user_gift_card_id'})

  };

  return RewardHistory;
};