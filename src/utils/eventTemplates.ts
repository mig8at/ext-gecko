export class EventTemplates {
  static getTemplate(eventType: string): any {
    const templates: { [key: string]: any } = {
      apigateway: {
        resource: "/{proxy+}",
        path: "/hello",
        httpMethod: "GET",
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "en-US,en;q=0.5",
          "Content-Type": "application/json",
          Host: "example.execute-api.us-east-1.amazonaws.com",
          "User-Agent": "Mozilla/5.0 (compatible; GeckoLambda/1.0)",
          "X-Forwarded-For": "192.0.2.1",
          "X-Forwarded-Port": "443",
          "X-Forwarded-Proto": "https",
        },
        multiValueHeaders: {},
        queryStringParameters: { name: "world", test: "value" },
        multiValueQueryStringParameters: {},
        pathParameters: { proxy: "hello" },
        stageVariables: null,
        requestContext: {
          accountId: "123456789012",
          apiId: "1234567890",
          httpMethod: "GET",
          path: "/hello",
          stage: "test",
          requestId: "c6af9ac6-7b61-11e6-9a41-93e8deadbeef",
          requestTimeEpoch: 1428582896000,
          resourceId: "123456",
          resourcePath: "/{proxy+}",
        },
        body: null,
        isBase64Encoded: false,
      },
      s3: {
        Records: [
          {
            eventVersion: "2.1",
            eventSource: "aws:s3",
            awsRegion: "us-east-1",
            eventTime: "2021-01-01T12:00:00.000Z",
            eventName: "ObjectCreated:Put",
            userIdentity: { principalId: "AIDACKCEVSQ6C2EXAMPLE" },
            requestParameters: { sourceIPAddress: "192.0.2.3" },
            responseElements: {
              "x-amz-request-id": "C3D13FE58DE4C810",
              "x-amz-id-2":
                "FMyUVURIY8/IgAtTv8xRjskZQpcIZ9KG4V5Wp6S7S/JRWeUWerMUE5JgHvANOjpD",
            },
            s3: {
              s3SchemaVersion: "1.0",
              configurationId: "testConfigRule",
              bucket: {
                name: "example-bucket",
                ownerIdentity: { principalId: "AIDACKCEVSQ6C2EXAMPLE" },
                arn: "arn:aws:s3:::example-bucket",
              },
              object: {
                key: "uploads/test-file.jpg",
                size: 1024,
                eTag: "d41d8cd98f00b204e9800998ecf8427e",
                sequencer: "0055AED6DCD90281E5",
              },
            },
          },
        ],
      },
      dynamodb: {
        Records: [
          {
            eventID: "1",
            eventVersion: "1.0",
            dynamodb: {
              Keys: { Id: { N: "101" } },
              NewImage: { Message: { S: "New item!" }, Id: { N: "101" } },
              StreamViewType: "NEW_AND_OLD_IMAGES",
              SequenceNumber: "111",
              SizeBytes: 26,
            },
            awsRegion: "us-west-2",
            eventName: "INSERT",
            eventSourceARN:
              "arn:aws:dynamodb:us-west-2:account-id:table/ExampleTableWithStream/stream/2015-06-27T00:48:05.899",
            eventSource: "aws:dynamodb",
          },
        ],
      },
      sqs: {
        Records: [
          {
            messageId: "19dd0b57-b21e-4ac1-bd88-01bbb068cb78",
            receiptHandle: "MessageReceiptHandle",
            body: "Hello from SQS!",
            attributes: {
              ApproximateReceiveCount: "1",
              SentTimestamp: "1523232000000",
              SenderId: "123456789012",
              ApproximateFirstReceiveTimestamp: "1523232000001",
            },
            messageAttributes: {},
            md5OfBody: "7b270e59b47ff90a553787216d55d91d",
            eventSource: "aws:sqs",
            eventSourceARN: "arn:aws:sqs:us-east-1:123456789012:MyQueue",
            awsRegion: "us-east-1",
          },
        ],
      },
    };

    return templates[eventType] || templates.apigateway;
  }

  static getSampleData(eventType: string): any | null {
    const sampleData: { [key: string]: any } = {
      apigateway: {
        body: JSON.stringify({
          name: "John Doe",
          age: 30,
          email: "john@example.com",
        }),
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sample-token",
        },
      },
      s3: {
        Records: [
          {
            s3: {
              object: {
                key: "uploads/sample-image.png",
                size: 2048,
                eTag: "new-etag-example",
              },
            },
          },
        ],
      },
      dynamodb: {
        Records: [
          {
            dynamodb: {
              NewImage: {
                AdditionalField: { S: "Sample additional data" },
              },
            },
          },
        ],
      },
      sqs: {
        Records: [
          {
            body: JSON.stringify({
              type: "order",
              orderId: "12345",
              customerId: "67890",
            }),
            messageAttributes: {
              MessageType: { StringValue: "Order", DataType: "String" },
            },
          },
        ],
      },
    };

    return sampleData[eventType] || null;
  }
}
