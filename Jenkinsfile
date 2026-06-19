pipeline {
    agent {
        label "${PROD_AGENT_LABEL}"
    }
    environment {
        DOCKER_FILES_PATH   = '/u01/cortacerto/'
    }
    triggers {
        pollSCM('H * * * *')
    }
    stages {

        stage('Sync Project Files') {
            steps {
                script {
                    sh """
                        sudo mkdir -p ${DOCKER_FILES_PATH} || true
                        sudo rsync -av \
                            --exclude='.git/' \
                            --exclude='.data/' \
                            --exclude='*.log' \
                            "${WORKSPACE}/" "${DOCKER_FILES_PATH}"
                    """
                }
            }
        }

        stage('Deploy Docker Compose') {
            steps {
                script {
                    sh """
                        cd "${DOCKER_FILES_PATH}"
                        sudo "ONLINE_MODE=1" > .env
                        sudo docker compose up -d --build
                    """
                }
            }
        }
    }
    post {
        always {
            cleanWs(deleteDirs: true, notFailBuild: true, disableDeferredWipeout: true)
        }
    }
}
