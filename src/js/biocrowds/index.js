'use strict'

var Sobol = require('../lib/sobol.js')
var sobol = new Sobol(2)
var Cube = require('../objects/cube.js')
var Cylinder = require('../objects/cylinder.js')
var Cone = require('../objects/cone.js')
var Triangle = require('../objects/triangle.js')
var Plane = require('../objects/plane.js')
var ShaderProgram = require('../shaderprogram.js')
var VoronoiGenerator = require('./voronoi-generate')
var Projector = require('./projector')
var VelocityCalculator = require('./velocity-calculate')
var VoronoiRefine = require('./voronoi-refine')
var TexturedPlane = require('./textured-plane')
var NoiseGenerator = require('./noise-generator')
var Obstacle = require('./obstacle')

var defaultOptions = {
  originX: -16,
  originZ: -16,
  sizeX: 32,
  sizeZ: 32,
  gridSize: 0.125,
  searchRadius: 2
}

var BioCrowds = function(gl, options) {

  for (var key in defaultOptions) {
    if (!options.hasOwnProperty(key)) {
      options[key] = defaultOptions[key]
    }
  }

  console.log(options)

  var gridWidth = Math.ceil(options.sizeX / options.gridSize)
  var gridDepth = Math.ceil(options.sizeZ / options.gridSize)
  options.gridWidth = gridWidth
  options.gridDepth = gridDepth

  var agents= []
  var obstacles = []
  var drawables = []

  var projector
  var voronoiGenerator
  var velocityCalculator
  var voronoiRefine
  var groundPlane
  var groundPlaneObj
  var comfortTex

  var bioCrowds = {
    init: function() {
      var GL = gl.getGL()
      var noiseGenerator = new NoiseGenerator()
      projector = new Projector(options)
      voronoiGenerator = new VoronoiGenerator(options)
      velocityCalculator = new VelocityCalculator(options)
      voronoiRefine = new VoronoiRefine(options)
      //comfortTex = noiseGenerator.generate(options.gridWidth, options.gridDepth, 3)

      if (options.comfortTexture) {
        comfortTex = require('../gl').loadImageTexture(options.comfortTexture)
      }

      var planeTrans = mat4.create()
      mat4.scale(planeTrans, planeTrans, vec3.fromValues(options.sizeX, 1, options.sizeZ))
      var planeCol = vec4.fromValues(0.8,0.8,0.8,1)

      groundPlaneObj = new TexturedPlane(options)
      var groundPlane = {
        draw: function() {
          groundPlaneObj.setViewProj(gl.viewProj)
          groundPlaneObj.setModelMat(planeTrans)
          groundPlaneObj.draw()
        }
      }
      gl.drawables.push(groundPlane)
      drawables.push(groundPlane)

      this.applyOptions()
    },

    applyOptions: function() {
      if (!options.vis.groundPlane) {
        groundPlaneObj.setTexture(null)  
      } else if (options.vis.groundPlane == 'voronoi') {
        groundPlaneObj.setTexture(voronoiGenerator.tex)
      } else if (options.vis.groundPlane == 'voronoi-refine') {
        groundPlaneObj.setTexture(voronoiRefine.tex)
      } else if (options.vis.groundPlane == 'weights') {
        groundPlaneObj.setTexture(velocityCalculator.tex)
      } else if (options.vis.groundPlane == 'comfort') {
        groundPlaneObj.setTexture(comfortTex)
      }
      voronoiGenerator.initAgentBuffers(agents)
    },

    deinit: function() {
      for (var i = 0; i < drawables.length; i++) {
        var idx =gl.drawables.indexOf(drawables[i])
        gl.drawables.splice(idx, 1)
      }
    },

    initAgents: function(theagents) {
      agents = theagents

      var agentTransMat = mat4.create()
      var agentOffset = vec3.fromValues(0, 0.5, 0)
      var arrowOffset = vec3.fromValues(0, 0.6, 0)
      var goalScale = vec3.fromValues(0.25, 2, 0.25)
      var agentPainter = function(idx) {
        return {
          draw: function() {
            if (agents[idx].finished) return
            mat4.identity(agentTransMat)
            mat4.translate(agentTransMat, agentTransMat, agents[idx].pos)
            mat4.translate(agentTransMat, agentTransMat, agentOffset)
            mat4.rotateY(agentTransMat, agentTransMat, Math.atan2(-agents[idx].forward[2], agents[idx].forward[0]))
            gl.Lambert.setColor(agents[idx].col)
            gl.Lambert.setModelMat(agentTransMat)
            gl.Lambert.draw(Cylinder.get())

            mat4.translate(agentTransMat, agentTransMat, arrowOffset)
            gl.Lambert.setModelMat(agentTransMat)
            gl.Lambert.draw(Triangle.get())

            mat4.identity(agentTransMat)
            mat4.translate(agentTransMat, agentTransMat, agents[idx].goal)
            mat4.translate(agentTransMat, agentTransMat, agentOffset)
            mat4.scale(agentTransMat, agentTransMat, goalScale)
            gl.Lambert.setModelMat(agentTransMat)
            gl.Lambert.draw(Cylinder.get())

            if (options.drawMarkers) {
              for (var i = 0; i < agents[idx].markers.length; i++) {
                var markerScale = vec3.fromValues(0.1, 0.1, 0.1)
                vec3.scale(markerScale, markerScale, markers[agents[idx].markers[i]].weight)

                mat4.identity(agentTransMat)
                mat4.translate(agentTransMat, agentTransMat, markers[agents[idx].markers[i]].pos)
                mat4.scale(agentTransMat, agentTransMat, markerScale)
                gl.Lambert.setModelMat(agentTransMat)
                gl.Lambert.draw(Cylinder.get())
              }
            }
          }
        }
      }

      for (var i = 0; i < agents.length; i++) {
        agents[i].done = false
        agents[i].markers = []

        var agent = agentPainter(i)
        gl.drawables.push(agent)
        drawables.push(agent)
      }
      // velocityCalculator.init(agents, projector)
      velocityCalculator.init(agents, projector, comfortTex)
      voronoiGenerator.initAgentBuffers(agents)
    },

    initObstacles: function(theobstacles) {
      if (!theobstacles) return
      obstacles = theobstacles
      var iden = mat4.create()
      var col = vec4.fromValues(0.2, 0.2, 0.2, 1)

      var obstacleDrawable = function(idx) {
        var obj = obstacles[idx].obj.get()
        return {
          draw: function() {
            gl.Lambert.setColor(col)
            gl.Lambert.setModelMat(iden)
            gl.Lambert.draw(obj)
          }
        }
      }

      for (var i = 0; i < obstacles.length; i++) {
        obstacles[i].obj = new Obstacle(obstacles[i].points)
        var obj = obstacleDrawable(i)
        gl.drawables.push(obj)
        drawables.push(obj)
      }
    },

    step: function(t) {
      var GL = gl.getGL()

      voronoiGenerator.setViewProj(projector.viewproj)

      GL.bindFramebuffer(GL.FRAMEBUFFER, voronoiGenerator.fbo)
      GL.viewport(0, 0, options.gridWidth, options.gridDepth)
      GL.clear( GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT)
      voronoiGenerator.draw()

      gl.Lambert.setViewProj(projector.viewproj)
      gl.Lambert.setColor(vec4.fromValues(1,1,1,1))
      gl.Lambert.setModelMat(mat4.create())
      for (var i = 0; i < obstacles.length; i++) {
        gl.Lambert.draw(obstacles[i].obj.get())
      }

      GL.bindFramebuffer(GL.FRAMEBUFFER, null)
      GL.viewport(0, 0, 150, 150)
      GL.clear( GL.DEPTH_BUFFER_BIT )
      voronoiGenerator.draw()

      gl.Lambert.setViewProj(projector.viewproj)
      gl.Lambert.setColor(vec4.fromValues(1,1,1,1))
      gl.Lambert.setModelMat(mat4.create())
      for (var i = 0; i < obstacles.length; i++) {
        gl.Lambert.draw(obstacles[i].obj.get())
      }

      GL.bindFramebuffer(GL.FRAMEBUFFER, voronoiRefine.fbo)
      GL.viewport(0, 0, options.gridWidth, options.gridDepth)
      voronoiRefine.draw(voronoiGenerator.tex)

      GL.bindFramebuffer(GL.FRAMEBUFFER, null)
      GL.viewport(150, 0, 150, 150)
      voronoiRefine.draw(voronoiGenerator.tex)

      velocityCalculator.setupDraw(agents, projector.viewproj, voronoiRefine.tex)
      GL.viewport(300, 0, 150, 150)
      velocityCalculator.drawWeights()

      GL.viewport(options.gridWidth, 0, options.gridWidth, options.gridDepth)
      GL.viewport(0, 0, options.gridWidth, options.gridDepth)
      velocityCalculator.draw()

      var velDir = vec3.create()
      var projected = vec3.create()
      for (var i = 0; i < agents.length; i++) {
        if (agents[i].finished) continue
        vec3.transformMat4(projected, agents[i].pos, projector.viewproj)
        var u = 0.5*(projected[0]+1)
        var v = 0.5*(projected[1]+1)

        var vel = velocityCalculator.getVelocityAt(u, v)
        
        if (isNaN(vel[0]) || isNaN(vel[2])) {
          continue
        }

        vec3.normalize(velDir, vel)

        if (vec3.length(vel) > 0) {
          vec3.lerp(agents[i].forward, agents[i].forward, velDir, Math.min(0.75,t/0.1));
          vec3.copy(agents[i].vel, vel)
          vec3.scaleAndAdd(agents[i].pos, agents[i].pos, agents[i].vel, t)
        }

        /*if (isNaN(velDir[0]) || isNaN(velDir[2])) {
          continue
        }
        var vel = vec3.create()
        if (vec3.length(velDir) > 0) {
          var amnt = vec3.length(velDir)
          // console.log(amnt)
          vec3.lerp(agents[i].forward, agents[i].forward, velDir, Math.min(1, Math.max(5*t, 6*t*amnt)))
          // vec3.lerp(agents[i].forward, agents[i].forward, vel, vec3.length(vel)/8);
          // vec3.copy(agents[i].forward, vel)
          // vec3.scale(vel, velDir, 1/options.gridSize)
          vec3.copy(agents[i].vel, vel)
          vec3.scaleAndAdd(agents[i].pos, agents[i].pos, agents[i].vel, t)
        } else {
          vec3.sub(velDir, agents[i].goal, agents[i].pos)
          vec3.lerp(agents[i].forward, agents[i].forward, velDir, 3*t)
        }*/
        
        if (vec3.distance(agents[i].pos, agents[i].goal) < 0.5) {
          agents[i].finished = true;
        }
      }
      
      velocityCalculator.teardown()
      voronoiGenerator.updateBuffers()
    },

    getOptions: function() {
      return options
    }
  }
  return bioCrowds
}

module.exports = BioCrowds