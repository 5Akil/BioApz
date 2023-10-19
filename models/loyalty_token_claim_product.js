'use strict';
module.exports = (sequelize, DataTypes) => {
    const LoyaltyTokenFreeProduct = sequelize.define('loyalty_token_claim_product', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        user_id: {
            type: DataTypes.INTEGER,
        },
        business_id: {
            type: DataTypes.INTEGER,
        },
        loyalty_token_card_id: {
            type: DataTypes.INTEGER,
        },
        product_id: {
            type: DataTypes.INTEGER,
        },
        product_name: {
            type: DataTypes.STRING,
        },
        product_price: {
            type: DataTypes.DOUBLE,
        },
        is_claimed: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        status: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        is_Deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    },
     {
        paranoid: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        deletedAt: 'deleted_at',
        // timestamps: false
    }
    );
    LoyaltyTokenFreeProduct.associate = function (models) {
        LoyaltyTokenFreeProduct.belongsTo(models.user, { foreignKey: 'user_id' })
        LoyaltyTokenFreeProduct.belongsTo(models.business, { foreignKey: 'business_id' })
        LoyaltyTokenFreeProduct.belongsTo(models.products, { foreignKey: 'product_id' })
        LoyaltyTokenFreeProduct.belongsTo(models.loyalty_token_cards, { foreignKey: 'loyalty_token_card_id' })
    };
    return LoyaltyTokenFreeProduct;
};  