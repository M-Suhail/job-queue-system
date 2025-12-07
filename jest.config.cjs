module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  testTimeout: 120000, // 2 minutes for integration tests (testcontainers)
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json', 'node'],
  verbose: true
};
