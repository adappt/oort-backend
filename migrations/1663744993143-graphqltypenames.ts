import { getDb } from '../migrations-utils/db';
import { Form, ReferenceData } from '../src/models';
import { buildTypes } from '../src/utils/schema';

getDb();

/**
 * Use to graphqltypenames migrate up.
 *
 * @returns just migrate data.
 */
export const up = async () => {
  const forms = await Form.find({ graphQLTypeName: { $exists: false } }).select(
    'name'
  );
  for (const form of forms) {
    await form.updateOne({
      graphQLTypeName: Form.getGraphQLTypeName(form.name),
    });
  }

  // update reference data
  const referenceDatas = await ReferenceData.find({
    graphQLTypeName: { $exists: false },
  }).select('name');
  for (const referenceData of referenceDatas) {
    await referenceData.updateOne({
      graphQLTypeName: ReferenceData.getGraphQLTypeName(referenceData.name),
    });
  }

  await buildTypes();

  console.log('\nMigration complete');
};

/**
 * Use to graphqltypenames migrate down.
 *
 * @returns just migrate data.
 */
export const down = async () => {
  /*
      Code you downgrade script here!
   */
};
