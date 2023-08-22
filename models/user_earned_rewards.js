'use strict';
module.exports = (sequelize, DataTypes) => {
  const userEarnedRewards = sequelize.define('user_earned_rewards', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id: {
        type: DataTypes.INTEGER,
    },
    reference_reward_id: {
        type: DataTypes.INTEGER,
    },
    reference_reward_type: {
        type: DataTypes.STRING,
    },
    expiry_date : DataTypes.DATE,
  }, {
     paranoid: true,
     deletedAt: 'deleted_at',
    // timestamps: false
  });
  
  userEarnedRewards.associate = function(models) {
    // associations can be defined here
    userEarnedRewards.belongsTo(models.user, {foreignKey: 'user_id'})
  };
  return userEarnedRewards;
};