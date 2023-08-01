'use strict';
module.exports = (sequelize, DataTypes) => {
  const UserGiftCards = sequelize.define('user_giftcards', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },

    gift_card_template_id:  {
        type: DataTypes.INTEGER,
    },

    gift_for: {
        type: DataTypes.TEXT,
    },
    from: {
        type: DataTypes.TEXT,
    },
    note: {
        type: DataTypes.TEXT,
    },
    to_email: {
        type: DataTypes.TEXT,
    },

    gift_card_id: {
        type: DataTypes.INTEGER,
    },

    business_id: {
        type: DataTypes.INTEGER,
    },
    user_id: {
        type: DataTypes.INTEGER,
    },
    purchase_date: {
        type: DataTypes.DATE,
    },
    amount: {
        type: DataTypes.DOUBLE(11, 2),
    },
    redeemed_amount: {
        type: DataTypes.DOUBLE(11, 2),
    },
    payment_status: {
        type: DataTypes.INTEGER,
    },
    status: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    is_deleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
  },{});

  UserGiftCards.associate = function(models) {
    // associations can be defined here
    UserGiftCards.belongsTo(models.gift_cards, {foreignKey: 'gift_card_id'});
    UserGiftCards.belongsTo(models.user, {foreignKey: 'user_id'});
    UserGiftCards.belongsTo(models.gift_card_template, {foreignKey: 'gift_card_template_id'});
  };
  return UserGiftCards;
}