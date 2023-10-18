const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const fs = require("fs");
// const privateKeyPath = process.env.PRIVATE_KEY_PATH;
// const publicKeyContent = process.env.PUBLIC_KEY_CONTENT;


const config = new pulumi.Config(); 
const keyName = config.require("aws-ec2-keyName");

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
    });
    // const privateKey = fs.readFileSync(privateKeyPath, "utf8");

    // const keyPair = new aws.ec2.KeyPair("myKeyPair", {
    //     publicKey: publicKeyContent,
    //     //privateKey: privateKey,
    // });
    //const keyPairName = ec2_keyPair
    // Create the EC2 instance
    const ec2Instance = new aws.ec2.Instance("myEC2Instance", {
        ami: ami, // Replace with your custom AMI ID
        instanceType: instance_type, // Replace with your instance type
        subnetId: publicSubnets[0].id, // Use a public subnet
        securityGroups: [applicationSecurityGroup.id],
        rootBlockDevice: {
            volumeSize: volumeSize, // Root volume size
            volumeType: volumeType, // General Purpose SSD (GP2)
            deleteOnTermination: true,
        },
        associatePublicIpAddress: true,
        keyName: keyName,
        disableApiTermination:false
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
        ec2InstanceId: ec2Instance.id, 
        
    };
}

module.exports = createVPC;
