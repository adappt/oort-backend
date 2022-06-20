import { AccessibleRecordModel, accessibleRecordsPlugin } from '@casl/mongoose';
import mongoose, { Schema, Document } from 'mongoose';
import { addOnBeforeDeleteMany } from '../utils/models/deletion';
import { Step } from './step';

/** Workflow  documents interface declaration */
export interface Workflow extends Document {
  kind: 'Workflow';
  name: string;
  createdAt: Date;
  modifiedAt: Date;
  steps: any[];
}

/** Mongoose workflow schema declaration */
const workflowSchema = new Schema<Workflow>({
  name: String,
  createdAt: Date,
  modifiedAt: Date,
  steps: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'Step',
  },
});

// handle cascading deletion for workflows
addOnBeforeDeleteMany(workflowSchema, async (workflows) => {
  const stepIds = workflows.reduce((acc, w) => acc.concat(w.steps), []);
  await Step.deleteMany({ _id: stepIds });
});

workflowSchema.plugin(accessibleRecordsPlugin);

/** Mongoose workflow model declaration */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export const Workflow = mongoose.model<
  Workflow,
  AccessibleRecordModel<Workflow>
>('Workflow', workflowSchema);
