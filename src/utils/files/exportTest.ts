import { Parser } from 'json2csv';
import { Workbook, stream } from 'exceljs';
import { Response } from 'express';
import { Resource } from '@models/resource.model';
import { Record } from '@models/record.model';
import getFilter from '@utils/filter/getFilter';
import buildCalculatedFieldPipeline from '@utils/aggregation/buildCalculatedFieldPipeline';
import { defaultRecordFields } from '@const/defaultRecordFields';

/**
 * Export batch parameters interface
 */
interface ExportBatchParams {
  fields?: any[];
  filter?: any;
  format: 'csv' | 'xlsx';
  query: any;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  resource?: string;
  timeZone: string;
  fileName: string;
}

const getColumnsFromFields = async (resource: Resource, fields: any[]) => {
  // Do concat for default fields later on
  const availableFields = resource.fields;
  const columns = [];
  for (const field of fields) {
    const resourceField = availableFields.find((f) => f.name === field.name);
    if (resourceField) {
      // Classic field
      columns.push({
        name: resourceField.name,
        path: resourceField.name,
        field: resourceField,
      });
    } else {
      console.log(field.name);
      // Related resources fields ( resource that refers to the exported one )
      const relatedResource = await Resource.findOne(
        {
          fields: {
            $elemMatch: {
              resource: resource._id.toString(),
              relatedName: field.name,
            },
          },
        },
        {
          'fields.$': 1,
        }
      );
      if (relatedResource) {
        columns.push({
          name: field.name,
          path: field.name,
          field: relatedResource.fields[0],
        });
      }
    }
  }
  // to do better than that
  for (const field of defaultRecordFields) {
    // Default field
    columns.push({
      name: field.field,
      path: field.field,
      // field: resourceField,
      project: field.project,
    });
  }
  return columns;
};

const recordPipeline = (ids, params, columns) => {
  const projectStep = {
    $project: {
      ...columns.reduce((acc, col) => {
        if (col.project) {
          acc[col.name] = col.project;
        } else {
          acc[col.name] = `$data.${col.name}`;
        }
        // acc[col.name] = `$data.${col.name}`;
        // const field = defaultRecordFields.find(
        //   (f) => f.field === col.field.split('.')[0]
        // );
        // if (field) {
        //   if (field.project) {
        //     acc[field.field] = field.project;
        //   } else {
        //     acc[field.field] = `$${field.field}`;
        //   }
        // } else {
        //   const parentName = col.field.split('.')[0]; //We get the parent name for the resource question
        //   acc[parentName] = `$data.${parentName}`;
        // }
        return acc;
      }, {}),
    },
  };
  const pipeline: any[] = [
    {
      $match: {
        _id: {
          $in: ids,
        },
      },
    },
  ];
  columns
    .filter((col) => col.meta?.field?.isCalculated)
    .forEach((col) =>
      pipeline.push(
        ...(buildCalculatedFieldPipeline(
          col.meta.field.expression,
          col.meta.field.name,
          params.timeZone
        ) as any)
      )
    );
  pipeline.push(projectStep);
  return pipeline;
};

const getRecords = async (resource, params, columns) => {
  const countAggregation = await Record.aggregate([
    {
      $match: {
        $and: [
          { resource: resource._id },
          getFilter(params.filter, columns),
          { archived: { $ne: true } },
        ],
      },
    },
    {
      $facet: {
        items: [
          {
            $project: {
              _id: 1,
            },
          },
        ],
        totalCount: [
          {
            $count: 'count',
          },
        ],
      },
    },
  ]);
  console.log('Count done');
  console.timeLog('export');
  const recordIds: any[] = countAggregation[0].items.map((x) => x._id);
  const totalCount = countAggregation[0].totalCount[0].count;
  const records: any[] = [];
  const promises: Promise<any>[] = [];
  const pageSize = 100;
  for (let i = 0; i < totalCount; i += pageSize) {
    const ids = recordIds.slice(i, i + pageSize);
    promises.push(
      Record.aggregate(recordPipeline(ids, params, columns)).then(
        // eslint-disable-next-line @typescript-eslint/no-loop-func
        (page) => {
          // console.log('Records from: ', i, ' to ', i + pageSize);
          records.concat(page);
        }
      )
    );
  }
  await Promise.all(promises);

  return records;
};

export default async (
  req: any,
  res: Response,
  resource: Resource,
  params: ExportBatchParams
) => {
  switch (params.format) {
    case 'xlsx': {
      let workbook: Workbook | stream.xlsx.WorkbookWriter;
      // Create a new instance of a Workbook class
      if (res.closed) {
        workbook = new Workbook();
      } else {
        workbook = new stream.xlsx.WorkbookWriter({
          stream: res,
          useStyles: true,
        });
      }
      const worksheet = workbook.addWorksheet('records');
      worksheet.properties.defaultColWidth = 15;
      const columns = await getColumnsFromFields(resource, params.fields);
      console.log('Columns ready');
      console.timeLog('export');
      // console.log(columns);
      const records = await getRecords(resource, params, columns);
      console.log('Sending file');
      console.timeEnd('export');
      // Close workbook
      if (workbook instanceof stream.xlsx.WorkbookWriter) {
        workbook.commit().then(() => {
          return `${params.fileName}.xlsx`;
        });
      } else {
        return workbook.xlsx.writeBuffer();
      }
      break;
    }
    case 'csv': {
      const json2csv = new Parser({ fields: params.fields });
      // Generate csv, by parsing the data
      const csvData = [];
      // Generate the file by parsing the data, set the response parameters and send it
      const csv = json2csv.parse(csvData);
      return csv;
    }
    // default
  }
};
