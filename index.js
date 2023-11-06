const pulumi = require ("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const fs = require("fs");
//const awsRDS = require("@pulumi/aws-rds");

//const host= "localhost";



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

//var probableSubnets = SubnetCIDRAdviser.calculate(base[0],base[1]);

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
                cidrBlocks: [destinationCidrBlock],
            },
            {
                protocol: "tcp",
                fromPort: http_port,
                toPort: http_port,
                cidrBlocks: [destinationCidrBlock],
            },
            {
                protocol: "tcp",
                fromPort: https_port,
                toPort: https_port,
                cidrBlocks: [destinationCidrBlock],
            },
            {
                protocol: "tcp",
                fromPort: custom_port, // Replace with the port your application runs on
                toPort: custom_port, // Replace with the port your application runs on
                cidrBlocks: [destinationCidrBlock],
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

    // const privateKey = fs.readFileSync(privateKeyPath, "utf8");

    // const keyPair = new aws.ec2.KeyPair("myKeyPair", {
    //     publicKey: publicKeyContent,
    //     //privateKey: privateKey,
    // });
    //const keyPairName = ec2_keyPair
    // Create the EC2 instance
  
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
        }],
    }),
    tags: {
        "tag-key": "tag-value",
    },
});
// IAM Role Policy Attachment
const rolePolicyAttachment = new aws.iam.RolePolicyAttachment("CloudWatchSampleAttachment", {
    policyArn: policyArn,
    role: instanceRole.name,
});
// IAM Instance Profile
const instanceProfile = new aws.iam.InstanceProfile("ec2_profile", {
    name: "ec2_profile",
    role: instanceRole.name,
});
    const ec2Instance = new aws.ec2.Instance("myEC2Instance", {
        vpcId:vpc.id,
        ami: ami, // Replace with your custom AMI ID
        instanceType: instance_type, // Replace with your instance type
        subnetId: publicSubnets[0].id, // Use a public subnet
        securityGroups: [applicationSecurityGroup.id],
        iamInstanceProfile: instanceProfile.name,
        rootBlockDevice: {
            volumeSize: volumeSize, // Root volume size
            volumeType: volumeType, // General Purpose SSD (GP2)
            deleteOnTermination: true,
        },
        associatePublicIpAddress: true,
        keyName: keyName,
        disableApiTermination:false,
        userData: pulumi.interpolate `#!/bin/bash
        echo "DB_HOST=${rdsInstance.address}" >> /etc/environment
        echo "DB_USER=${rdsInstance.username}" >> /etc/environment
        echo "DB_PASSWORD=${rdsInstance.password}" >> /etc/environment
        echo "DB_PORT=${rdsInstance.port}" >> /etc/environment
        echo "DB_DATABASE=${rdsInstance.dbName}" >> /etc/environment
        sudo chown -R csye6225:csye6225 /opt/csye6225/combined.log
        sudo chmod -R 770 -R /opt/csye6225/combined.log
        sudo systemctl daemon-reload
        sudo systemctl enable webapp
        sudo systemctl restart webapp
        
        sudo ../../../opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/home/admin/webapp/cloudwatch-config.json -s
        sudo systemctl restart amazon-cloudwatch-agent
        `
        
    });

    
// Create a Route53 A record
const route53Record = new aws.route53.Record("myRoute53Record", {
    name: zoneName,
    records: [ec2Instance.publicIp], // The public IP of your EC2 instance
    ttl: ttl, // Adjust TTL as needed
    type:recordType,
    zoneId: zoneId, // Replace with your Route53 zone ID
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
        ec2InstanceId: ec2Instance.id, 
        rdsInstance: rdsInstance, // Add the RDS instance here
        route53Record:route53Record,
        instanceRole:instanceRole,
        rolePolicyAttachment:rolePolicyAttachment,
        instanceProfile:instanceProfile


        
        
    };
}

module.exports = createVPC;
