
const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");

const config = new pulumi.Config();


async function createVPC() {
    // Get the AWS region from the Pulumi configuration
    const awsRegion = config.require("awsRegion");
    const baseCIDR = config.get("baseCIDR");
    const destinationCidrBlock = config.get("destinationCidrBlock");

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
    const n = Math.min(numAZs,numPublicSubnets);
    // Create subnets in each Availability Zone
    const publicSubnets = [];
    const privateSubnets = [];
   // Access the list of CIDR blocks
   const subnetCIDRs = config.getObject("subnetCidr");
   for (let i = 0; i < n; i++) {
    const azIndex = i % n; // Calculate the AZ index
    //const subnetCIDR = subnetCIDRs[i];

    // Create a public subnet
    if (i < numPublicSubnets) {
        const publicSubnet = new aws.ec2.Subnet(`publicSubnet${i}`, {
            vpcId: vpc.id,
            cidrBlock: subnetCIDRs[i*2],
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
            cidrBlock: subnetCIDRs[i*2+1],
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
    console.log(`numPublicSubnets: ${numPublicSubnets}`);
console.log(`numPrivateSubnets: ${numPrivateSubnets}`);
    // Export VPC and subnets for future use
    return {
        
        vpcId: vpc.id,
        publicSubnets: publicSubnets,
        privateSubnets: privateSubnets,
        numAZs: numAZs,
        numPublicSubnets: numPublicSubnets, // Include numPublicSubnets
        numPrivateSubnets: numPrivateSubnets, // Include numPrivateSubnets
    };
}

module.exports = createVPC;
