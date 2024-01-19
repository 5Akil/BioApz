'use strict';
module.exports = (sequelize, DataTypes) => {
    const LoyaltyCards = sequelize.define('loyalty_token_cards', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        business_id: {
            type: DataTypes.INTEGER,
        },
        name: DataTypes.STRING,
        description: DataTypes.STRING,
        token_icon_id:DataTypes.INTEGER,
        min_purchase_amount: DataTypes.DOUBLE,
        product_id: DataTypes.INTEGER,
        no_of_tokens: DataTypes.INTEGER,
        status: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        is_Deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
    }, {
        paranoid: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        deletedAt: 'deleted_at',
    }


    );
    LoyaltyCards.associate = function (models) {
        // LoyaltyCards.belongsTo(models.business, { foreignKey: 'business_id' })
        LoyaltyCards.belongsTo(models.business, { foreignKey: 'business_id'})

        LoyaltyCards.belongsTo(models.products, { foreignKey: 'product_id' })
        LoyaltyCards.hasMany(models.loyalty_token_card_history,{foreignKey:'loyalty_token_card_id'})
        LoyaltyCards.belongsTo(models.loyalty_token_icon ,{foreignKey:"token_icon_id"})

    };
    return LoyaltyCards;
};