import { Group } from '@models';
import { faker } from '@faker-js/faker';

/**
 * Test Group Model.
 */
describe('Group models tests', () => {
  test('test with correct data', async () => {
    for (let i = 0; i < 1; i++) {
      const groupData = {
        title: faker.random.word(),
        description: faker.commerce.productDescription(),
        oid: faker.datatype.uuid(),
      };
      const saveData = await new Group(groupData).save();
      expect(saveData._id).toBeDefined();
      expect(saveData).toHaveProperty(['createdAt']);
    }
  });

  test('test with blank channel name field', async () => {
    const groupData = {
      title: faker.science.unit(),
      description: faker.commerce.productDescription(),
      oid: faker.datatype.uuid(),
    };
    expect(async () => new Group(groupData).save()).rejects.toThrow(Error);
  });
});
