'use strict';
module.exports = (sequelize, DataTypes) => {
  const Cashbacks = sequelize.define('loyalty_points', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    business_id: {
        type: DataTypes.INTEGER,
    },
    title: DataTypes.STRING,
     cashback_on: {
      type: DataTypes.BOOLEAN
    },
    cashback_type: {
      type: DataTypes.BOOLEAN
    },
    cashback_value: DataTypes.DECIMAL,
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
  Cashbacks.associate = function(models) {
    // associations can be defined here
    Cashbacks.belongsTo(models.business, {foreignKey: 'business_id'})
  };
  return Cashbacks;
};