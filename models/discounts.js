'use strict';
module.exports = (sequelize, DataTypes) => {
  const Discounts = sequelize.define('discounts', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    business_id: {
        type: DataTypes.INTEGER,
    },
    title: DataTypes.STRING,
    discount_type: {
      type: DataTypes.BOOLEAN
    },
    discount_value: DataTypes.DECIMAL,
    product_category_id: {
        type: DataTypes.INTEGER,
    },
    product_id: {
        type: DataTypes.INTEGER,
    },
    validity_for: DataTypes.INTEGER,
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
  Discounts.associate = function(models) {
    // associations can be defined here
    Discounts.belongsTo(models.business, {foreignKey: 'business_id'})
    Discounts.belongsTo(models.product_categorys, { foreignKey: 'product_category_id' })
  };
  return Discounts;
};