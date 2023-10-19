'use strict';
module.exports = (sequelize, DataTypes) => {
  const GiftCards = sequelize.define('gift_cards', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    business_id: {
        type: DataTypes.INTEGER,
    },
    image: {
      type: DataTypes.STRING
    },
    name: DataTypes.STRING,
    amount: DataTypes.DECIMAL,
    cashback_percentage : DataTypes.DECIMAL,
    expire_at: DataTypes.DATE,
    description: DataTypes.STRING,
    is_cashback: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    status: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },    
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
  }, 
  {
     paranoid: true,
     deletedAt: 'deleted_at',
    // timestamps: false
  });
  GiftCards.associate = function(models) {
    // associations can be defined here
    GiftCards.belongsTo(models.business, {foreignKey: 'business_id'})
    GiftCards.hasMany(models.user_giftcards, {foreignKey: 'gift_card_id'})
  };
  return GiftCards;
};