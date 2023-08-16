'use strict';
module.exports = (sequelize, DataTypes) => {
  const LoyaltyPoints = sequelize.define('loyalty_points', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    business_id: {
        type: DataTypes.INTEGER,
    },
    loyalty_type: {
      type: DataTypes.BOOLEAN
    },
    name: DataTypes.STRING,
    points_earned: DataTypes.INTEGER,
    product_id: {
        type: DataTypes.INTEGER,
    },
    amount: DataTypes.DECIMAL,
    gift_card_id: {
      type: DataTypes.INTEGER,
    },
    points_redeemed:{
      type:DataTypes.BOOLEAN
    },
    validity:DataTypes.DATE,
    validity_period: DataTypes.INTEGER,
    status: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },    
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
  }, {
     paranoid: true,
     deletedAt: 'deleted_at',
    // timestamps: false
  });
  LoyaltyPoints.associate = function(models) {
    // associations can be defined here
    LoyaltyPoints.belongsTo(models.business, {foreignKey: 'business_id'})
    LoyaltyPoints.belongsTo(models.products, {foreignKey: 'product_id'})
    LoyaltyPoints.belongsTo(models.gift_cards, {foreignKey: 'gift_card_id'})
  };
  return LoyaltyPoints;
};