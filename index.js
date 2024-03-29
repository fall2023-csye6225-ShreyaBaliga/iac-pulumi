const pulumi = require ("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const fs = require("fs");
//const awsRDS = require("@pulumi/aws-rds");
// const gcpStack = require("../gcp-pulumi/index");
// const gcpResources = gcpStack.createResources();
//const host= "localhost";

const gcp = require("@pulumi/gcp");
const path = require('path');


// const privateKeyPath = process.env.PRIVATE_KEY_PATH;
// const publicKeyContent = process.env.PUBLIC_KEY_CONTENT;


const config = new pulumi.Config(); 
const keyName = config.require("aws-ec2-keyName");
const dbEngine = config.require("dbEngine"); 
const dbInstanceClass = config.require("dbInstanceClass"); // Replace with your desired instance class
const dbName = config.require("dbName"); // Replace with your desired database name
const masterUsername = config.require("masterUsername"); // Replace with your desired master username
const masterPassword = config.require("masterPassword"); // Replace with your desired master password
const port = config.require("port");
//var SubnetCIDRAdviser = require( 'subnet-cidr-calculator' );
 // Get the AWS region from the Pulumi configuration
 const awsRegion = config.require("awsRegion");
 const baseCIDR = config.get("baseCIDR");
 const destinationCidrBlock = config.get("destinationCidrBlock");

var base = baseCIDR.split('/');
 const AWS = require("aws-sdk");
// var credentials = new AWS.SharedIniFileCredentials({profile:"demo"})
// AWS.config.credentials=credentials;
 AWS.config.update({region:"us-east-1"});
// AWS.config.getCredentials(function(err){
//     if(err)
//     {
//         console.log(err.stack);
//     }
//     else
//     {
//         console.log(AWS.config.credentials.accessKeyId);
//     }
// })
//var probableSubnets = SubnetCIDRAdviser.calculate(base[0],base[1]);
aws.sdk.config.credentials= new aws.sdk.SharedIniFileCredentials({profile:"demo"});
let accessKeyId = AWS.config.credentials.accessKeyId;
let secretAccessKey = AWS.config.credentials.secretAccessKey;
async function createVPC() {
   

    // Create a new VPC
    const vpc = new aws.ec2.Vpc("myVpc", {
        cidrBlock:baseCIDR,
        enableDnsSupport: true,
        enableDnsHostnames: true,
        tags: {
            Name: "myVpc", // Set the desired tag name and value here
        },
    });

    // Create an Internet Gateway
    const internetGateway = new aws.ec2.InternetGateway("myInternetGateway", {});

    // Attach the Internet Gateway to the VPC
    const attachment = new aws.ec2.InternetGatewayAttachment("myInternetGatewayAttachment", {
        vpcId: vpc.id,
        internetGatewayId: internetGateway.id,
    });

    // Retrieve the number of Availability Zones for the specified region
    const zones = await aws.getAvailabilityZones({ region: awsRegion });
    const numAZs = zones.names.length;
   
    // Define the number of public and private subnets to create
    let numPublicSubnets = config.require("numPublicSubnets");
    let numPrivateSubnets = config.require("numPrivateSubnets");
    const ami = config.require( "custom_ami");
    const instance_type = config.require("instance_type");
    const ssh_port = config.require("ssh_port");
    const http_port = config.require("http_port");
    const https_port = config.require("https_port");
    const custom_port = config.require("custom_port");
    const volumeSize = config.require("volume_size");
    const volumeType = config.require("volume_type");
    const eport = config.require("eport");
    const policyArn = config.require("policyArn");
    const ttl= config.require("ttl");
    const zoneName=config.require("zoneName");
    const zoneId=config.require("zoneId");
    const recordType=config.require("recordType");
    let githubReleaseUrl = config.require("githubReleaseUrl");

    const n = Math.min(numAZs,numPublicSubnets);
    // Create subnets in each Availability Zone
    const publicSubnets = [];
    const privateSubnets = [];
   // Access the list of CIDR blocks
   const publicSubnetCIDRs = config.getObject("publicSubnetCidr");
   const privateSubnetCIDRs = config.getObject("privateSubnetCidr");
   for (let i = 0; i < n; i++) {
    const azIndex = i % n; // Calculate the AZ index
    //const subnetCIDR = subnetCIDRs[i];

    // Create a public subnet
    if (i < numPublicSubnets) {
        const publicSubnet = new aws.ec2.Subnet(`publicSubnet${i}`, {
            vpcId: vpc.id,
            cidrBlock: publicSubnetCIDRs[i],
            availabilityZone: zones.names[azIndex],
            mapPublicIpOnLaunch: true,
            tags: {
                Name: `publicSubnet${i}`,
            },
        });
        publicSubnets.push(publicSubnet);
    }

    // Create a private subnet
    if (i < numPrivateSubnets) {
        const privateSubnet = new aws.ec2.Subnet(`privateSubnet${i}`, {
            vpcId: vpc.id,
            cidrBlock: privateSubnetCIDRs[i],
            availabilityZone: zones.names[azIndex],
            tags: {
                Name: `privateSubnet${i}`,
            },
        });
        privateSubnets.push(privateSubnet);
    }
}
    // Create public route table and associate with public subnets
    const publicRouteTable = new aws.ec2.RouteTable("publicRouteTable", {
        vpcId: vpc.id,
        tags: {
            Name: "publicRouteTable",
        },
    });

    // Create a public route for the public route table
    const publicRoute = new aws.ec2.Route("publicRoute", {
        routeTableId: publicRouteTable.id,
        destinationCidrBlock:destinationCidrBlock,
        gatewayId: internetGateway.id,
    });

    for (let i = 0; i < publicSubnets.length; i++) {
        const subnetAssociation = new aws.ec2.RouteTableAssociation(`publicSubnetAssociation${i}`, {
            subnetId: publicSubnets[i].id,
            routeTableId: publicRouteTable.id,
        });
    }

    // Create private route table and associate with private subnets
    const privateRouteTable = new aws.ec2.RouteTable("privateRouteTable", {
        vpcId: vpc.id,
        tags: {
            Name: "privateRouteTable",
        },
    });

    for (let i = 0; i < privateSubnets.length; i++) {
        const subnetAssociation = new aws.ec2.RouteTableAssociation(`privateSubnetAssociation${i}`, {
            subnetId: privateSubnets[i].id,
            routeTableId: privateRouteTable.id,
        });
    }
    // In createVPC function after applicationSecurityGroup creation
const loadBalancerSecurityGroup = new aws.ec2.SecurityGroup("loadBalancerSecurityGroup", {
    vpcId: vpc.id,
    tags: {
        Name: "loadBalancerSecurityGroup",
    },
    ingress: [
        {
            protocol: "tcp",
            fromPort: http_port,
            toPort: http_port,
            cidrBlocks: [destinationCidrBlock], // Replace with a more restricted source if needed
        },
        {
            protocol: "tcp",
            fromPort: https_port,
            toPort: https_port,
            cidrBlocks: [destinationCidrBlock], // Replace with a more restricted source if needed
        },
    ],
    egress:
        [
            {
            protocol: "-1",
            fromPort: eport,
            toPort:eport,
            cidrBlocks:[destinationCidrBlock]
            }
            

        ]
});

const applicationLoadBalancer = new aws.lb.LoadBalancer("applicationLoadBalancer", {
    name: "alb",
    internal: false,
    loadBalancerType: "application",
    securityGroups: [loadBalancerSecurityGroup.id],
    subnets: publicSubnets.map(subnet => subnet.id),
    enableDeletionProtection: false,
});
const albTargetGroup = new aws.lb.TargetGroup("albTargetGroup", {
    name: "webapp-tg",
    port: custom_port,
    protocol: "HTTP",
    vpcId: vpc.id,
    healthCheck: {
        enabled: true,
        interval: 30,
        path: "/healthz",
        timeout: 5,
        port:custom_port,
        matcher: "200",
        healthyThreshold: 2,
        unhealthyThreshold: 2,
    },
    deregistrationDelay:500
});
// const albHttpListener = new aws.lb.Listener("albHttpListener", {
//     loadBalancerArn: applicationLoadBalancer.arn, // Replace with your load balancer ARN
//     port: http_port,
//     protocol: "HTTP",
//     defaultActions: [
//         {
//             type: "forward",
//             targetGroupArn: albTargetGroup.arn,
//         },
//     ],
// });

const albHttpsListener = new aws.lb.Listener("albHttpsListener", {
    loadBalancerArn: applicationLoadBalancer.arn,
    port: 443,
    protocol: "HTTPS",
    sslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06",
    defaultActions: [
        {
            type: "forward",
            targetGroupArn: albTargetGroup.arn,
            // fixedResponse: {
            //     contentType: "application/json",
            //     statusCode: "200",
                // messageBody: "OK",
            //},
        },
    ],
    certificateArn: "arn:aws:acm:us-east-1:065889916706:certificate/5f20cde7-e583-4eec-98a4-2767baf4fbd6", // Replace with your ACM certificate ARN
});


// // Refer to loadBalancerSecurityGroup.id where required

      // Create an Application Security Group for your EC2 instances
      const applicationSecurityGroup = new aws.ec2.SecurityGroup("applicationSecurityGroup", {
        vpcId: vpc.id,
        tags:{

            Name: "customAG",

        },
        ingress: [
            {
                protocol: "tcp",
                fromPort: ssh_port,
                toPort: ssh_port,
                //cidrBlocks: [destinationCidrBlock],
                securityGroups: [loadBalancerSecurityGroup.id]
            },
            // {
            //     protocol: "tcp",
            //     fromPort: http_port,
            //     toPort: http_port,
            //     cidrBlocks: [destinationCidrBlock],
            // },
            // {
            //     protocol: "tcp",
            //     fromPort: https_port,
            //     toPort: https_port,
            //     cidrBlocks: [destinationCidrBlock],
            // },
            {
                protocol: "tcp",
                fromPort: custom_port, // Replace with the port your application runs on
                toPort: custom_port, // Replace with the port your application runs on
                //cidrBlocks: [destinationCidrBlock],
                securityGroups: [loadBalancerSecurityGroup.id]
            },
        ],
        egress:
        [
            {
            protocol: "-1",
            fromPort: eport,
            toPort:eport,
            cidrBlocks:[destinationCidrBlock]
            }

        ]
       
    });
    // Create the RDS database security group
const dbSecurityGroup = new aws.ec2.SecurityGroup("dbSecurityGroup", {
    vpcId: vpc.id,
    tags: {
        Name: "databaseSecurityGroup",
    },
    ingress: [
        {
            protocol: "tcp",
            fromPort: port, // Postgres
            toPort: port,
            securityGroups: [applicationSecurityGroup.id],
        },
    ],
    egress:
        [
            {
            protocol: "-1",
            fromPort: eport,
            toPort:eport,
            cidrBlocks:[destinationCidrBlock]
            }

        ]
});
const dbParameterGroup = new aws.rds.ParameterGroup("my-db-parameter-group", {
    vpcId:vpc.id,
    family: "postgres14", 
    // parameters: [
    //     {
    //         name: "max_connections",
    //         value: "100",
    //     },
      
    //],
});

//     // const privateKey = fs.readFileSync(privateKeyPath, "utf8");

//     // const keyPair = new aws.ec2.KeyPair("myKeyPair", {
//     //     publicKey: publicKeyContent,
//     //     //privateKey: privateKey,
//     // });
//     //const keyPairName = ec2_keyPair
//     // Create the EC2 instance
  
    const dbSubnetGroup = new aws.rds.SubnetGroup("my-db-subnet-group", {
        subnetIds: privateSubnets.map((subnet) => subnet.id),
        // Add any other necessary properties here
    });
    
    const rdsInstance = new aws.rds.Instance("my-rds-instance", {
        allocatedStorage: 10, // Customize allocated storage
        storageType: "gp2", // Customize storage type
        engine: dbEngine, // Use "postgres" for PostgreSQL
        engineVersion: "14.7", // Customize the PostgreSQL version
        instanceClass: dbInstanceClass, // Use the desired instance class
        username: masterUsername, // Use the master username
        password: masterPassword, // Use the master password
        parameterGroupName:dbParameterGroup.Name, // Associate the custom parameter group
        vpcSecurityGroupIds: [dbSecurityGroup.id],
        skipFinalSnapshot: true, // Customize as needed
        publiclyAccessible: false, // Set to true only if needed
        dbName:dbName,
        multiAz:false,
        dbSubnetGroupName:dbSubnetGroup.name,
        //subnetId: privateSubnets[0].id,
    });

    const snsTopic = new aws.sns.Topic("mySNSTopic", {
        displayName: "My SNS Topic",
        tags: {
            Name: "mySNSTopic",
        },
    });
        // Create Google Cloud Storage bucket
        const gcpBucket = new gcp.storage.Bucket("custom-bucket", {
            location: "us-east1", // Specify your desired region
            forceDestroy: true,
          });
        
          // Create Google Service Account
          const serviceAccount = new gcp.serviceaccount.Account("myServiceAccount", {
            accountId: "shreya-baliga-sa", // Specify a unique account ID
            displayName: "Shreya Baliga",
              email: "baligashreyacc@gmail.com"
          });
        
          // Create Access Keys for the Google Service Account
          const serviceAccountKey = new gcp.serviceaccount.Key("myServiceAccountKey", {
            serviceAccountId: serviceAccount.accountId,
          });
    
        //   // IAM policy binding for the service account
        //   const serviceAccountIamBinding = new gcp.projects.IAMBinding("serviceAccountIamBinding", {
        //     project: "csye6225-demo",
        //     role: "roles/iam.admin",  // Adjust the role as needed
        //     members: [serviceAccount.email],
        // });
            // IAM policy binding for the bucket
            const bucketIamBinding = new gcp.storage.BucketIAMBinding("bucketIamBinding", {
                bucket: gcpBucket.name,
                role: "roles/storage.objectAdmin",  // Adjust the role as needed
                members: [serviceAccount.email.apply((email)=>`serviceAccount:${email}`)],
            });
        
 
    // Allow publish to the SNS topic
// const snsTopicPolicy = new aws.sns.TopicPolicy("mySNSTopicPolicy", {
//     arn: snsTopic.arn,
//     policy: snsTopic.arn.apply(arn => JSON.stringify({
//         Version: "2012-10-17",
//         Id: "SNSTopicPolicy",
//         Statement: [
//             {
//                 Effect: "Allow",
//                 Action: "sns:Publish",
//                 Resource: arn,
//             },
//         ],
//     })),
//     });
    // IAM Role for EC2 instance
    const instanceRole = new aws.iam.Role("EC2-CSYE6225", {
        assumeRolePolicy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [{
                Action: "sts:AssumeRole",
                Effect: "Allow",
                Principal: {
                    Service: "ec2.amazonaws.com",
                },
            },
            {
                Action: "sts:AssumeRole",
                Effect: "Allow",
                Principal: {
                    Service: "autoscaling.amazonaws.com",
                },
           },
           {
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
                Service: "lambda.amazonaws.com",
            },
       },
       {
        Action: "sts:AssumeRole",
        Effect: "Allow",
        Principal: {
            Service: "sns.amazonaws.com",
        },
    },
           {
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
              Service: "lambda.amazonaws.com",
            },
    
           },
        ]
        }),
        tags: {
            "tag-key": "tag-value",
        },
        policies: [
            {
                PolicyName: "SNSPublishPolicy",
                PolicyDocument: {
                    Version: "2012-10-17",
                    Statement: [
                        {
                            Effect: "Allow",
                            Action: "sns:Publish",
                            Resource: "*"
                        },
                        {
                            Effect: "Allow",
                            Action: "lambda:InvokeFunction",
                            Resource: "*"
                        }
                    ],
                },
            },
           
        ],
    });
    // IAM Role Policy Attachment
    const rolePolicyAttachment = new aws.iam.RolePolicyAttachment("CloudWatchSampleAttachment", {
        policyArn: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
        role: instanceRole.name,
    });
    // IAM Instance Profile
    const instanceProfile = new aws.iam.InstanceProfile("ec2_profile", {
        name: "ec2_profile",
        role: instanceRole.name,
    });
    

      
    // IAM Role for Lambda Function
    // const lambdaRole = new aws.iam.Role("myLambdaRole", {
    //     assumeRolePolicy: JSON.stringify({
    //         Version: "2012-10-17",
    //         Statement: [
    //             {
    //                 Action: "sts:AssumeRole",
    //                 Effect: "Allow",
    //                 Principal: {
    //                     Service: "lambda.amazonaws.com",
    //                 },
    //             },
    //         ],
    //     }),
    // });

   
    // Attach policies to the Lambda Role (adjust policies based on your Lambda function needs)
    const lambdaRolePolicy = new aws.iam.RolePolicyAttachment("myLambdaRolePolicy", {
        policyArn: "arn:aws:iam::aws:policy/AWSLambda_FullAccess",
        role: instanceRole.name,
    });
    // Attach policies to the Lambda Role (adjust policies based on your Lambda function needs)
    const lambdaRolePolicy2 = new aws.iam.RolePolicyAttachment("myLambdaRolePolicy2", {
        policyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
        role: instanceRole.name,
    });
    // Attach AmazonSESFullAccess policy to the Lambda role for SES permissions
    const sesPolicy = new aws.iam.RolePolicyAttachment("sesPolicy", {
        role: instanceRole.name,
        policyArn: "arn:aws:iam::aws:policy/AmazonSESFullAccess",
    });
    
// Attach a policy to the IAM role
const snsPolicyAttachment = new aws.iam.RolePolicyAttachment("snsPolicy", {
    role: instanceRole.name,
    policyArn: "arn:aws:iam::aws:policy/AmazonSNSFullAccess", // Adjust with the desired policy
  });
    
    // Create DynamoDB instance
    const dynamoDBTable = new aws.dynamodb.Table("myDynamoDBTable", {
        name: "track-emails",
        attributes: [
          { name: "id", type: "S" },
        ],
        hashKey: "id",
        readCapacity: 5,
        writeCapacity: 5,
      });
    
    
      // Lambda Function
      const lambdaFunction = new aws.lambda.Function("myLambdaFunction", {
        runtime: "nodejs14.x",
        code: new pulumi.asset.FileArchive(path.resolve(__dirname, '../../serverless')),
        handler: "index.handler",
        role: instanceRole.arn,
        timeout: 300,
        environment: {
            variables: {
                GCS_BUCKET_NAME: gcpBucket.name,
                GOOGLE_ACCESS_KEY_ID: serviceAccount.email,
                GOOGLE_SECRET_ACCESS_KEY:serviceAccountKey.privateKey,
                DYNAMODB_TABLE_NAME: dynamoDBTable.name,
                SES_SMTP_ENDPOINT: "email-smtp.us-east-1.amazonaws.com",
                accessKeyId:accessKeyId,
                secretAccessKey:secretAccessKey,
                githubReleaseUrl:githubReleaseUrl

                // SES_EMAIL_TEMPLATE_NAME: sesEmailTemplate.name,
                // Add other environment variables as needed
            },
        },
    });
    // Create a lambda subscription for the SNS topic
    const lambdaSubscription = new aws.sns.TopicSubscription("mySNSTopicSubscription", {
        protocol: "lambda",
        topic: snsTopic.arn,
        endpoint: lambdaFunction.arn
    });
    new aws.lambda.Permission("permission", {
        action: "lambda:InvokeFunction",
        "function": lambdaFunction.name,
        principal: "sns.amazonaws.com",
        sourceArn: snsTopic.arn,
    });
    // const ec2Instance = new aws.ec2.Instance("myEC2Instance", {
    //     vpcId:vpc.id,
    //     ami: ami, // Replace with your custom AMI ID
    //     instanceType: instance_type, // Replace with your instance type
    //     subnetId: publicSubnets[0].id, // Use a public subnet
    //     securityGroups: [applicationSecurityGroup.id],
    //     iamInstanceProfile: instanceProfile.name,
    //     rootBlockDevice: {
    //         volumeSize: volumeSize, // Root volume size
    //         volumeType: volumeType, // General Purpose SSD (GP2)
    //         deleteOnTermination: true,
    //     },
    //     associatePublicIpAddress: true,
    //     keyName: keyName,
    //     disableApiTermination:false,
    //     userData: pulumi.interpolate `#!/bin/bash
    //     echo "DB_HOST=${rdsInstance.address}" >> /etc/environment
    //     echo "DB_USER=${rdsInstance.username}" >> /etc/environment
    //     echo "DB_PASSWORD=${rdsInstance.password}" >> /etc/environment
    //     echo "DB_PORT=${rdsInstance.port}" >> /etc/environment
    //     echo "DB_DATABASE=${rdsInstance.dbName}" >> /etc/environment
    //     sudo chown -R csye6225:csye6225 /opt/csye6225/combined.log
    //     sudo chmod -R 770 -R /opt/csye6225/combined.log
    //     sudo chown -R csye6225:csye6225 /opt/csye6225/webapp
    //     sudo chmod -R 750 -R /opt/csye6225/webapp
    //     sudo systemctl daemon-reload
    //     sudo systemctl enable webapp.service
    //     sudo systemctl restart webapp.service
        
    //     sudo ../../../opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/csye6225/webapp/cloudwatch-config.json -s
    //     sudo systemctl restart amazon-cloudwatch-agent
    //     `
        
    // });
    const userDataString= pulumi.interpolate `#!/bin/bash
    echo "DB_HOST=${rdsInstance.address}" >> /etc/environment
    echo "DB_USER=${rdsInstance.username}" >> /etc/environment
    echo "DB_PASSWORD=${rdsInstance.password}" >> /etc/environment
    echo "DB_PORT=${rdsInstance.port}" >> /etc/environment
    echo "DB_DATABASE=${rdsInstance.dbName}" >> /etc/environment
    echo "SNS_TOPIC=${snsTopic.arn}" >> /etc/environment
    echo "GCS_BUCKET_NAME=${gcpBucket.name}" >> /etc/environment
    

    sudo chown -R csye6225:csye6225 /opt/csye6225/combined.log
    sudo chmod -R 770 -R /opt/csye6225/combined.log
    sudo chown -R csye6225:csye6225 /opt/csye6225/webapp
    sudo chmod -R 750 -R /opt/csye6225/webapp
    sudo systemctl daemon-reload
    sudo systemctl enable webapp.service
    sudo systemctl restart webapp.service
    sudo ../../../opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/csye6225/webapp/cloudwatch-config.json -s
    sudo systemctl restart amazon-cloudwatch-agent `

    // Convert the user data string to a Base64-encoded string
  const base64EncodedData = pulumi.output(userDataString).apply((script)=>Buffer.from(script).toString('base64'));
    
    const launchTemplate = new aws.ec2.LaunchTemplate("app_server", {
        name: "launch_template",
        imageId: ami,
        instanceType: instance_type,
        keyName: keyName,
        //vpcSecurityGroupIds:[applicationSecurityGroup.id],
        iamInstanceProfile: {
            name: instanceProfile.name,
        },
        networkInterfaces: [
            {
                associatePublicIpAddress: true,
                securityGroups: [applicationSecurityGroup.id],
            },
        ],
        blockDeviceMappings: [
            {
                deviceName: "/dev/xvda",
                ebs: {
                    volumeSize: volumeSize,
                    volumeType: volumeType,
                },
            },
        ],
        userData: base64EncodedData
    });
 // Create the Auto Scaling Group
 const autoScalingGroup = new aws.autoscaling.Group("appAutoScalingGroup", {
    name: "asg_launch_config",
    defaultCooldown: 60,
    minSize: 1,
    maxSize: 3,
    desiredCapacity: 1,
    launchTemplate: {
        id: launchTemplate.id,
        version: "$Latest", // Modify this to match your configuration
    },
    vpcZoneIdentifiers: publicSubnets.map(subnet => subnet.id), 
    healthCheckType: "EC2",
    healthCheckGracePeriod:500,
    tags: [
        {
        key: "webapp",
        value: "webappInstance",
        propagateAtLaunch: true,
    }
],
    targetGroupArns: [albTargetGroup.arn], 
});
// Create scaling policies
const scaleUpPolicy = new aws.autoscaling.Policy("scaleUpPolicy", {
    autoscalingGroupName: autoScalingGroup.name,
    adjustmentType: "ChangeInCapacity",
    scalingAdjustment: 1,
    cooldown: 60,
    metricAggregationType:"Average",
    policyType:"SimpleScaling"
});

const scaleDownPolicy = new aws.autoscaling.Policy("scaleDownPolicy", {
    autoscalingGroupName: autoScalingGroup.name,
    adjustmentType: "ChangeInCapacity",
    scalingAdjustment: -1,
    cooldown: 60,
    metricAggregationType:"Average",
    policyType:"SimpleScaling"
});
 // Create CloudWatch alarms
 const scaleUpAlarm = new aws.cloudwatch.MetricAlarm("scaleUpAlarm", {
    comparisonOperator: "GreaterThanThreshold",
    evaluationPeriods: 2,
    metricName: "CPUUtilization",
    namespace: "AWS/EC2",
    period: 60,
    statistic: "Average",
    threshold: 5,
    dimensions: {
        AutoScalingGroupName: autoScalingGroup.name,
    },
    alarmActions: [scaleUpPolicy.arn],
});

const scaleDownAlarm = new aws.cloudwatch.MetricAlarm("scaleDownAlarm", {
    comparisonOperator: "LessThanThreshold",
    evaluationPeriods: 2,
    metricName: "CPUUtilization",
    namespace: "AWS/EC2",
    period: 60,
    statistic: "Average",
    threshold: 3,
    dimensions: {
        AutoScalingGroupName: autoScalingGroup.name,
    },
    alarmActions: [scaleDownPolicy.arn],
});
// Create a Route53 A record
// const route53Record = new aws.route53.Record("myRoute53Record", {
//     name: zoneName,
//     zoneId: zoneId,
//     type:recordType,
    
//     alias: {
        
//         name: applicationLoadBalancer.dnsName,
//         zoneId: applicationLoadBalancer.zoneId,
//         evaluateTargetHealth: true,
//         ttl:ttl
//     },// Replace with your Route53 zone ID
//     //records: [ec2Instance.publicIp], // The public IP of your EC2 instance
//     //ttl:ttl, // Adjust TTL as needed
    
    
// });
const route53Record = new aws.route53.Record("myRoute53Record", {
    name: zoneName,
    zoneId: zoneId,
    aliases:[
        {
        name: applicationLoadBalancer.dnsName, // ELB DNS name
        zoneId: applicationLoadBalancer.zoneId, // ELB zone ID
        evaluateTargetHealth: true,
    }
],
    type: recordType,
    //records: [applicationLoadBalancer.dnsName], // Or whatever IP/record you need to point to
    
});


    // Export VPC and subnets for future use
    return {
        
        vpcId: vpc.id,
        publicSubnets: publicSubnets,
        privateSubnets: privateSubnets,
        numAZs: numAZs,
        numPublicSubnets: numPublicSubnets, // Include numPublicSubnets
        numPrivateSubnets: numPrivateSubnets, // Include numPrivateSubnets
        applicationSecurityGroup:applicationSecurityGroup,
        dbSecurityGroup:dbSecurityGroup,
        dbParameterGroup: dbParameterGroup, // Add the parameter group here
        //ec2InstanceId: ec2Instance.id, 
        rdsInstance: rdsInstance, // Add the RDS instance here
        route53Record:route53Record,
        instanceRole:instanceRole,
        rolePolicyAttachment:rolePolicyAttachment,
        instanceProfile:instanceProfile,
        loadBalancerSecurityGroup:loadBalancerSecurityGroup,
        applicationLoadBalancer:applicationLoadBalancer,
        albTargetGroup:albTargetGroup,
        albHttpsListener:albHttpsListener,
        launchTemplate:launchTemplate,
        autoScalingGroup:autoScalingGroup,
        scaleUpPolicy:scaleUpPolicy,
        scaleDownPolicy:scaleDownPolicy,
        scaleUpAlarm:scaleUpAlarm,
        scaleDownAlarm:scaleDownAlarm,
        snsTopic:snsTopic,
        snsPolicyAttachment:snsPolicyAttachment,
        // snsTopicPolicy:snsTopicPolicy,
        lambdaSubscription:lambdaSubscription,
        dynamoDBTable:dynamoDBTable,
        gcpBucket:gcpBucket,
        serviceAccount:serviceAccount,
        serviceAccountKey:serviceAccountKey,
        //serviceAccountIamBinding:serviceAccountIamBinding,
        bucketIamBinding:bucketIamBinding,
        // lambdaRole:lambdaRole,
        lambdaRolePolicy:lambdaRolePolicy,
        lambdaRolePolicy2:lambdaRolePolicy2,
        lambdaFunction:lambdaFunction,
        sesPolicy:sesPolicy,
        albHttpsListener:albHttpsListener
       



        
        
    };
}

module.exports = createVPC;


