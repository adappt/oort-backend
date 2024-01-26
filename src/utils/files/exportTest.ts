import { Parser } from 'json2csv';
import { Workbook, Worksheet, stream } from 'exceljs';
import { Response } from 'express';
import { Resource } from '@models/resource.model';
import { Record } from '@models/record.model';
import getFilter from '@utils/filter/getFilter';
import buildCalculatedFieldPipeline from '@utils/aggregation/buildCalculatedFieldPipeline';
import { defaultRecordFields } from '@const/defaultRecordFields';
import get from 'lodash/get';
import { logger } from '@services/logger.service';
import { getRowsFromMeta } from './getRowsFromMeta';

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

/**
 * Write rows in xlsx format
 *
 * @param worksheet worksheet to write on
 * @param columns columns to use
 * @param records records to write as rows
 */
const writeRowsXlsx = (
  worksheet: Worksheet,
  columns: any[],
  records: any[]
) => {
  records.forEach((record) => {
    const temp = [];
    let maxFieldLength = 0;
    for (const column of columns) {
      if (column.subTitle) {
        const value = get(record, column.field, []);
        maxFieldLength = Math.max(maxFieldLength, value.length);
        temp.push('');
      } else {
        temp.push(get(record, column.path, null));
      }
    }

    if (maxFieldLength > 0) {
      const subIndexes = columns.filter((x) => x.subTitle).map((x) => x.index);
      for (let i = 0; i < maxFieldLength; i++) {
        for (const column of columns.filter((x: any) => x.subTitle)) {
          const value = get(record, column.field, []);
          if (value && value.length > 0) {
            temp[column.index] = get(
              get(record, column.field, null)[i],
              column.subField,
              null
            );
          } else {
            temp[column.index] = null;
          }
        }
        const row = worksheet.addRow(temp);
        if (i !== 0) {
          row.eachCell((cell, colNumber) => {
            if (!subIndexes.includes(colNumber - 1)) {
              cell.font = {
                color: { argb: 'FFFFFFFF' },
              };
            }
          });
        }
        row.commit();
      }
    } else {
      const row = worksheet.addRow(temp);
      row.commit();
    }
  });
};

/**
 * Get flat columns from raw columns
 *
 * @param columns raw columns
 * @returns flat columns
 */
const getFlatColumns = (columns: any[]) => {
  let index = -1;
  return columns.reduce((acc, value) => {
    if (value.subColumns) {
      // Create nested headers
      if (value.subColumns.length > 0) {
        return acc.concat(
          value.subColumns.map((x) => {
            index += 1;
            return {
              name: value.name,
              title: value.title || value.name,
              subName: x.name,
              subTitle: x.title || x.name,
              field: value.field,
              subField: x.field,
              index,
            };
          })
        );
      } else {
        // Create a single column as we see in the grid
        index += 1;
        return acc.concat({
          name: value.name,
          title: value.title || value.name,
          field: value.field,
          index,
        });
      }
    } else {
      index += 1;
      return acc.concat({
        name: value.name,
        title: value.title || value.name,
        path: value.path,
        index,
      });
    }
  }, []);
};

const getColumnsFromFields = async (resource: Resource, fields: any[]) => {
  // Do concat for default fields later on
  const availableFields = resource.fields;
  const columns = [];
  for (const field of fields) {
    console.log(field);
    const resourceField = availableFields.find((f) => f.name === field.name);
    if (resourceField) {
      // Classic field
      columns.push({
        name: resourceField.name,
        path: resourceField.name,
        field: resourceField,
        type: resourceField.type,
        meta: {
          field: resourceField,
        },
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
  let records: any[] = [];
  const promises: Promise<any>[] = [];
  const pageSize = 100;
  for (let i = 0; i < totalCount; i += pageSize) {
    const ids = recordIds.slice(i, i + pageSize);
    promises.push(
      Record.aggregate(recordPipeline(ids, params, columns)).then(
        // eslint-disable-next-line @typescript-eslint/no-loop-func
        (page) => {
          // console.log('Records from: ', i, ' to ', i + pageSize);
          records = records.concat(page);
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
  // Get columns
  const columns = await getColumnsFromFields(resource, params.fields);
  console.log('Columns ready');
  console.timeLog('export');
  // console.log(columns);
  const records = await getRecords(resource, params, columns);
  console.log(records.length);
  console.log('Ready to write');
  console.timeLog('export');
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
      try {
        writeRowsXlsx(
          worksheet,
          getFlatColumns(columns),
          getRowsFromMeta(columns, records)
        );
      } catch (err) {
        logger.error(err.message);
      }
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
