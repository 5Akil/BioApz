module.exports = (sequelize, DataTypes) => {
  const BusinessInquiry = sequelize.define('business_inquiry', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
    },
    business_name: DataTypes.STRING,
    contact_person: {
      type: DataTypes.STRING,
    },
    email: DataTypes.TEXT,
    phone: DataTypes.STRING,
    address: DataTypes.STRING,
    latitude: DataTypes.DOUBLE,
    longitude: DataTypes.DOUBLE,
    description: DataTypes.TEXT,
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
  }, {
    // timestamps: false
  });
  BusinessInquiry.associate = function(models) {
    // associations can be defined here
  };
  return BusinessInquiry;
};