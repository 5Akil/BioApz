'use strict';
module.exports = (sequelize, DataTypes) => {
  const Coupones = sequelize.define('coupones', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    business_id: {
        type: DataTypes.INTEGER,
    },
    title: DataTypes.STRING,
    coupon_code: DataTypes.STRING,
    coupon_type: {
      type: DataTypes.BOOLEAN
    },
    product_category_id: {
        type: DataTypes.INTEGER,
    },
    product_id: {
        type: DataTypes.INTEGER,
    },
    products: DataTypes.STRING,
    order_min_value: DataTypes.DECIMAL,
    expire_at: DataTypes.DATE,
    description: DataTypes.STRING,
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
  Coupones.associate = function(models) {
    // associations can be defined here
    Coupones.belongsTo(models.business, {foreignKey: 'business_id'})
  };
  return Coupones;
};